/**
 * Correlates detection results into SecurityInvestigation records.
 *
 * Correlation is deterministic (see correlation.ts) - grouping is based on
 * shared rule/principal/resource/source IP/account and a fixed time window,
 * never an opaque model score. See SecurityInvestigation.correlationExplanation
 * for the human-readable reasoning behind each grouping.
 */

import Redis from 'ioredis';
import { nanoid } from 'nanoid';
import { logger } from '../../lib/logger.js';
import type {
  DetectionResult,
  InvestigationStatus,
  InvestigationTimelineEntry,
  NormalizedSecurityEvent,
  ResponseActionRecord,
  SecurityInvestigation,
  SecurityPrincipal,
  SecurityResource,
} from '../security/types.js';
import { buildCorrelationKey, explainCorrelation, extractCorrelationFactors } from './correlation.js';
import type { PipelineMetrics } from '../security/pipeline-metrics.js';

const INVESTIGATION_KEY_PREFIX = 'sec:investigation:';
const INVESTIGATION_INDEX_KEY = 'sec:investigations:index';
const CORRELATION_KEY_PREFIX = 'sec:investigation:by-correlation:';
const RETENTION_SECONDS = 180 * 24 * 60 * 60; // 180 days

function mergeUnique<T>(existing: T[], incoming: T[]): T[] {
  return Array.from(new Set([...existing, ...incoming]));
}

function mergePrincipals(
  existing: SecurityPrincipal[],
  incoming?: SecurityPrincipal
): SecurityPrincipal[] {
  if (!incoming || (!incoming.id && !incoming.email && !incoming.displayName)) return existing;
  const key = incoming.id ?? incoming.email ?? incoming.displayName;
  if (existing.some((p) => (p.id ?? p.email ?? p.displayName) === key)) return existing;
  return [...existing, incoming];
}

function mergeResources(existing: SecurityResource[], incoming?: SecurityResource): SecurityResource[] {
  if (!incoming || (!incoming.id && !incoming.name)) return existing;
  const key = incoming.id ?? incoming.name;
  if (existing.some((r) => (r.id ?? r.name) === key)) return existing;
  return [...existing, incoming];
}

export class InvestigationService {
  constructor(
    private readonly redis: Redis,
    private readonly metrics?: PipelineMetrics
  ) {}

  /**
   * Apply a detection result (and the event that produced it) to the investigation
   * graph: reuse an open investigation sharing the same correlation key, or open a
   * new one. Returns the resulting investigation.
   */
  async correlate(
    event: NormalizedSecurityEvent,
    detection: DetectionResult
  ): Promise<SecurityInvestigation> {
    const correlationKey = buildCorrelationKey(event, detection);
    const factors = extractCorrelationFactors(event, detection);
    const explanation = explainCorrelation(factors);

    const existingId = await this.redis.get(`${CORRELATION_KEY_PREFIX}${correlationKey}`);
    const existing = existingId ? await this.getInvestigation(existingId) : null;

    const now = new Date().toISOString();

    if (existing) {
      const reopened = existing.status === 'resolved' || existing.status === 'closed';
      const updated: SecurityInvestigation = {
        ...existing,
        status: reopened ? 'investigating' : existing.status,
        updatedAt: now,
        eventIds: mergeUnique(existing.eventIds, [event.id]),
        detectionIds: mergeUnique(existing.detectionIds, [detection.id]),
        affectedPrincipals: mergePrincipals(existing.affectedPrincipals, event.principal),
        affectedResources: mergeResources(existing.affectedResources, event.resource),
        sourceIps: event.sourceIp ? mergeUnique(existing.sourceIps, [event.sourceIp]) : existing.sourceIps,
        providerScopes: mergeUnique(existing.providerScopes, [event.provider]),
        timeline: [
          ...existing.timeline,
          this.timelineEntry(reopened ? 'status_change' : 'detection', event, detection,
            reopened
              ? `Investigation reopened: new matching detection ${detection.ruleId} received after prior resolution.`
              : `Additional detection ${detection.ruleId} correlated into this investigation.`
          ),
        ],
      };
      await this.persist(updated);
      await this.metrics?.recordInvestigationDedup();
      logger.info({ investigationId: updated.id, ruleId: detection.ruleId }, 'Detection correlated into existing investigation');
      return updated;
    }

    const investigation: SecurityInvestigation = {
      id: nanoid(),
      title: detection.title,
      severity: detection.severity,
      status: 'open',
      createdAt: now,
      updatedAt: now,
      providerScopes: [event.provider],
      eventIds: [event.id],
      detectionIds: [detection.id],
      affectedPrincipals: mergePrincipals([], event.principal),
      affectedResources: mergeResources([], event.resource),
      sourceIps: event.sourceIp ? [event.sourceIp] : [],
      provenance: event.provenance,
      correlationKey,
      correlationExplanation: explanation,
      timeline: [
        this.timelineEntry('event', event, detection, `Normalized ${event.provider} event ingested: ${event.title}.`),
        this.timelineEntry('detection', event, detection, `Detection rule ${detection.ruleId} matched: ${detection.description}`),
        this.timelineEntry('investigation_created', event, detection, `Investigation opened. ${explanation}`),
      ],
      responseActions: [],
      evidence: [
        { type: 'raw-event', label: 'Normalized event', reference: event.id },
        { type: 'source-code', label: `Detection rule ${detection.ruleId}`, reference: 'src/modules/detection/rules' },
      ],
      summary: detection.description,
      whyItMatters: detection.severityRationale ?? this.defaultWhyItMatters(detection),
    };

    await this.persist(investigation);
    await this.redis.setex(
      `${CORRELATION_KEY_PREFIX}${correlationKey}`,
      RETENTION_SECONDS,
      investigation.id
    );
    await this.metrics?.recordInvestigationCreated();
    logger.info({ investigationId: investigation.id, ruleId: detection.ruleId }, 'New investigation opened');
    return investigation;
  }

  async attachResponseAction(
    investigationId: string,
    action: ResponseActionRecord
  ): Promise<SecurityInvestigation | null> {
    const investigation = await this.getInvestigation(investigationId);
    if (!investigation) return null;

    const updated: SecurityInvestigation = {
      ...investigation,
      updatedAt: new Date().toISOString(),
      responseActions: [...investigation.responseActions, action],
      timeline: [
        ...investigation.timeline,
        {
          id: nanoid(),
          timestamp: new Date().toISOString(),
          type: action.mode === 'enforced' ? 'enforcement_result' : 'response_decision',
          summary: `Response action ${action.action} (${action.mode}) - ${action.result}`,
          actor: action.actor,
          provenance: investigation.provenance,
          metadata: { responseActionId: action.id },
        },
      ],
    };
    await this.persist(updated);
    return updated;
  }

  async setStatus(
    investigationId: string,
    status: InvestigationStatus,
    actor: string,
    note?: string
  ): Promise<SecurityInvestigation | null> {
    const investigation = await this.getInvestigation(investigationId);
    if (!investigation) return null;

    const updated: SecurityInvestigation = {
      ...investigation,
      status,
      updatedAt: new Date().toISOString(),
      timeline: [
        ...investigation.timeline,
        {
          id: nanoid(),
          timestamp: new Date().toISOString(),
          type: 'status_change',
          summary: note ?? `Status changed to ${status}`,
          actor,
          provenance: investigation.provenance,
        },
      ],
    };
    await this.persist(updated);
    return updated;
  }

  async getInvestigation(id: string): Promise<SecurityInvestigation | null> {
    const raw = await this.redis.get(`${INVESTIGATION_KEY_PREFIX}${id}`);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as SecurityInvestigation;
    } catch {
      return null;
    }
  }

  async listInvestigations(params?: {
    limit?: number;
    offset?: number;
    status?: InvestigationStatus;
  }): Promise<SecurityInvestigation[]> {
    const limit = params?.limit ?? 50;
    const offset = params?.offset ?? 0;
    const ids = await this.redis.zrevrange(INVESTIGATION_INDEX_KEY, offset, offset + limit - 1);
    if (ids.length === 0) return [];
    const pipeline = this.redis.pipeline();
    for (const id of ids) {
      pipeline.get(`${INVESTIGATION_KEY_PREFIX}${id}`);
    }
    const results = await pipeline.exec();
    const investigations: SecurityInvestigation[] = [];
    if (!results) return investigations;
    for (const [err, data] of results) {
      if (err || !data) continue;
      try {
        const inv = JSON.parse(data as string) as SecurityInvestigation;
        if (!params?.status || inv.status === params.status) investigations.push(inv);
      } catch {
        // skip invalid
      }
    }
    return investigations;
  }

  private async persist(investigation: SecurityInvestigation): Promise<void> {
    const key = `${INVESTIGATION_KEY_PREFIX}${investigation.id}`;
    const score = new Date(investigation.updatedAt).getTime();
    const pipeline = this.redis.pipeline();
    pipeline.setex(key, RETENTION_SECONDS, JSON.stringify(investigation));
    pipeline.zadd(INVESTIGATION_INDEX_KEY, score, investigation.id);
    await pipeline.exec();
  }

  private timelineEntry(
    type: InvestigationTimelineEntry['type'],
    event: NormalizedSecurityEvent,
    detection: DetectionResult,
    summary: string
  ): InvestigationTimelineEntry {
    return {
      id: nanoid(),
      timestamp: new Date().toISOString(),
      type,
      summary,
      actor: 'detection-engine',
      provenance: event.provenance,
      source: detection.ruleId,
    };
  }

  private defaultWhyItMatters(detection: DetectionResult): string {
    return `Matched by ${detection.ruleId} (severity: ${detection.severity}). ${detection.description}`;
  }
}
