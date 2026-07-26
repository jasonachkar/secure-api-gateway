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
// A burst of correlated detections (a guided scenario, a noisy source hitting one
// account) can mean a couple dozen callers contend for the same investigation's merge
// lock at once - MAX_MERGE_ATTEMPTS and the jittered backoff below are sized for that,
// not just incidental two-way races.
const MAX_MERGE_ATTEMPTS = 30;

/**
 * Atomically claims a correlation key for `candidateId`. Checked and (if free) set
 * within a single Lua script, so two concurrent detections sharing a correlation key can
 * never both observe "no investigation yet" - Redis executes the whole script as one
 * atomic step. Returns the id that ends up owning the key: `candidateId` if this call
 * won (caller should create a new investigation), or an existing investigation's id
 * otherwise (caller should merge into it).
 */
const CLAIM_CORRELATION_SCRIPT = `
local key = KEYS[1]
local candidateId = ARGV[1]
local ttl = ARGV[2]

local existing = redis.call('GET', key)
if existing then
  return existing
end

redis.call('SETEX', key, ttl, candidateId)
return candidateId
`;

/**
 * Releases a per-investigation merge lock only if the caller still holds it (its token
 * matches). Guards against releasing a lock that a later retry - after our own lock
 * expired - now legitimately owns.
 */
const RELEASE_LOCK_SCRIPT = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
end
return 0
`;

const MERGE_LOCK_TTL_MS = 3000;

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
   * graph: reuse an open investigation sharing the same correlation key, or open a new
   * one. Race-free under concurrent calls sharing a correlation key - see
   * CLAIM_CORRELATION_SCRIPT and mergeIntoExisting - and idempotent: correlating the
   * same detection into the same investigation twice (a retried call, a re-run replay)
   * is a no-op the second time rather than double-appending a timeline entry.
   */
  async correlate(
    event: NormalizedSecurityEvent,
    detection: DetectionResult
  ): Promise<SecurityInvestigation> {
    const correlationKey = buildCorrelationKey(event, detection);
    const candidateId = nanoid();

    const winningId = (await this.redis.eval(
      CLAIM_CORRELATION_SCRIPT,
      1,
      `${CORRELATION_KEY_PREFIX}${correlationKey}`,
      candidateId,
      RETENTION_SECONDS
    )) as string;

    if (winningId === candidateId) {
      const factors = extractCorrelationFactors(event, detection);
      const explanation = explainCorrelation(factors);
      const now = new Date().toISOString();

      const investigation: SecurityInvestigation = {
        id: candidateId,
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
      await this.metrics?.recordInvestigationCreated();
      logger.info({ investigationId: investigation.id, ruleId: detection.ruleId }, 'New investigation opened');
      return investigation;
    }

    // Someone else's claim won the correlation key (possibly concurrently with us) -
    // their investigation is authoritative; merge this detection into it.
    return this.mergeIntoExisting(winningId, event, detection);
  }

  /**
   * Merge a detection into an already-claimed investigation under a per-investigation
   * lock (a short-TTL SET NX token, not Redis WATCH/MULTI/EXEC): this app shares one
   * Redis connection across every concurrent request handler, and WATCH's unwatched
   * state lives on the *connection*, not the logical caller - two unrelated concurrent
   * operations issuing WATCH/MULTI on the same shared connection can abort or corrupt
   * each other's transactions. A lock keyed to the investigation avoids that entirely:
   * only plain GET/SET/DEL commands are used, which are safe on a shared connection.
   * Bounded by MAX_MERGE_ATTEMPTS so a pathologically hot correlation key can't retry
   * forever.
   */
  private async mergeIntoExisting(
    investigationId: string,
    event: NormalizedSecurityEvent,
    detection: DetectionResult,
    attempt = 0
  ): Promise<SecurityInvestigation> {
    if (attempt >= MAX_MERGE_ATTEMPTS) {
      throw new Error(
        `Failed to correlate detection ${detection.id} into investigation ${investigationId} after ${MAX_MERGE_ATTEMPTS} attempts (contention too high)`
      );
    }

    const key = `${INVESTIGATION_KEY_PREFIX}${investigationId}`;
    const lockKey = `sec:investigation:merge-lock:${investigationId}`;
    const lockToken = nanoid();

    const acquired = await this.redis.set(lockKey, lockToken, 'PX', MERGE_LOCK_TTL_MS, 'NX');
    if (acquired !== 'OK') {
      // Jittered, not lockstep: with many concurrent losers, a fixed delay keyed only to
      // `attempt` has them all retry at the same instant and collide again repeatedly.
      await this.sleep(5 * (attempt + 1) + Math.random() * 20);
      return this.mergeIntoExisting(investigationId, event, detection, attempt + 1);
    }

    try {
      const raw = await this.redis.get(key);

      if (!raw) {
        // The claimant's investigation never showed up (e.g. its write failed after
        // claiming). Rather than lose this detection, fall through to a fresh
        // investigation. This does not touch the correlation-key claim (still owned by
        // the original candidate), so it's a rare, self-contained fallback, not a
        // silent duplicate-investigation generator under normal operation.
        return await this.createFallbackInvestigation(event, detection);
      }

      const existing = JSON.parse(raw) as SecurityInvestigation;

      if (existing.detectionIds.includes(detection.id)) {
        // Idempotent: this exact detection was already correlated into this
        // investigation (a retried call, a re-run replay) - no-op rather than
        // double-appending a timeline entry or re-triggering a reopen.
        return existing;
      }

      const reopened = existing.status === 'resolved' || existing.status === 'closed';
      const now = new Date().toISOString();
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
          this.timelineEntry(
            reopened ? 'status_change' : 'detection',
            event,
            detection,
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
    } finally {
      await this.redis.eval(RELEASE_LOCK_SCRIPT, 1, lockKey, lockToken);
    }
  }

  private async createFallbackInvestigation(
    event: NormalizedSecurityEvent,
    detection: DetectionResult
  ): Promise<SecurityInvestigation> {
    const correlationKey = buildCorrelationKey(event, detection);
    const factors = extractCorrelationFactors(event, detection);
    const explanation = explainCorrelation(factors);
    const now = new Date().toISOString();
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
    await this.metrics?.recordInvestigationCreated();
    logger.warn(
      { investigationId: investigation.id, ruleId: detection.ruleId },
      'Correlation-key claimant never persisted its investigation - opened a fallback investigation instead of losing this detection'
    );
    return investigation;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
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
