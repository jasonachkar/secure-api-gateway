/**
 * Canonical security ingestion pipeline: provider payload -> parse -> normalize ->
 * redact -> persist (atomic dedupe) -> detect -> correlate.
 *
 * This is the ONLY place that runs that sequence. Every ingestion path - the manual
 * fixture-replay endpoint, guided scenarios, and the live AWS/GCP polling adapters -
 * calls this same function, so "replay" and "live" only ever differ in where the raw
 * payload came from and what provenance they pass in, never in what happens to it once
 * it arrives. See docs/CLOUD_INGESTION.md.
 */
import { parseProviderEvent } from './parsers/index.js';
import type { SecurityEventStore } from './security-event.store.js';
import type { DetectionEngine } from '../detection/engine.js';
import type { DetectionStore } from '../detection/detection.store.js';
import type { InvestigationService } from '../investigations/investigation.service.js';
import type { PipelineMetrics } from '../security/pipeline-metrics.js';
import type {
  CloudProvider,
  DataProvenance,
  DetectionResult,
  NormalizedSecurityEvent,
  SecurityInvestigation,
} from '../security/types.js';

export interface SecurityIngestionPipelineDeps {
  securityEventStore: SecurityEventStore;
  detectionEngine: DetectionEngine;
  detectionStore: DetectionStore;
  investigationService: InvestigationService;
  pipelineMetrics: PipelineMetrics;
}

export interface IngestProviderEventParams {
  provider: Exclude<CloudProvider, 'gateway'>;
  /** The provider-native payload, already unwrapped from any transport envelope (e.g. a CloudWatch Logs subscription wrapper) but not yet parsed into the canonical schema. */
  raw: unknown;
  provenance: DataProvenance;
  /** Used only for the parser-failure record when `raw` can't be parsed - not part of the canonical event once parsing succeeds. */
  sourceServiceOnFailure?: string;
}

export interface IngestProviderEventResult {
  event: NormalizedSecurityEvent;
  duplicate: boolean;
  detections: DetectionResult[];
  investigations: SecurityInvestigation[];
  timings: {
    parseMs: number;
    persistMs: number;
    detectMs: number;
    correlateMs: number;
    totalMs: number;
  };
}

function toFailurePayload(raw: unknown): Record<string, unknown> {
  if (typeof raw === 'object' && raw !== null && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  // Parser failures on a non-object payload (a raw string log line, for example) still
  // need to go through the same redaction path as everything else - wrap it so
  // saveParserFailure's redactObject() has a record to walk.
  return { value: typeof raw === 'string' ? raw : JSON.stringify(raw) };
}

/**
 * Ingest one provider-native event through the full canonical pipeline. Throws on parse
 * failure (after recording a redacted failure record + metrics) so callers that process
 * events one at a time - a live adapter's poll loop, in particular - can catch it, skip
 * just that one malformed record, and keep going rather than losing the whole batch.
 */
export async function ingestProviderEvent(
  deps: SecurityIngestionPipelineDeps,
  params: IngestProviderEventParams
): Promise<IngestProviderEventResult> {
  const t0 = Date.now();
  let event: NormalizedSecurityEvent;

  try {
    event = parseProviderEvent(params.provider, params.raw, params.provenance);
  } catch (error) {
    await deps.securityEventStore.saveParserFailure({
      provider: params.provider,
      sourceService: params.sourceServiceOnFailure ?? params.provider,
      occurredAt: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown parser error',
      provenance: params.provenance,
      rawEvent: toFailurePayload(params.raw),
    });
    await deps.pipelineMetrics.recordParserFailure();
    throw error;
  }
  const parseMs = Date.now() - t0;

  const t1 = Date.now();
  const { event: saved, duplicate } = await deps.securityEventStore.saveEvent(event);
  await deps.pipelineMetrics.recordIngested(params.provider);
  await deps.pipelineMetrics.recordIngestionDelay(saved.ingestionDelayMs);
  const persistMs = Date.now() - t1;

  if (duplicate) {
    await deps.pipelineMetrics.recordDuplicate();
    return {
      event: saved,
      duplicate: true,
      detections: [],
      investigations: [],
      timings: { parseMs, persistMs, detectMs: 0, correlateMs: 0, totalMs: Date.now() - t0 },
    };
  }

  const t2 = Date.now();
  const detections = await deps.detectionEngine.evaluate(saved);
  await deps.detectionStore.saveAll(detections);
  const detectMs = Date.now() - t2;
  await deps.pipelineMetrics.recordDetectionDuration(detectMs);

  const t3 = Date.now();
  const investigations: SecurityInvestigation[] = [];
  for (const detection of detections) {
    investigations.push(await deps.investigationService.correlate(saved, detection));
  }
  const correlateMs = Date.now() - t3;
  await deps.pipelineMetrics.recordCorrelationDuration(correlateMs);

  const totalMs = Date.now() - t0;
  await deps.pipelineMetrics.recordEndToEndDuration(totalMs);

  return {
    event: saved,
    duplicate: false,
    detections,
    investigations,
    timings: { parseMs, persistMs, detectMs, correlateMs, totalMs },
  };
}
