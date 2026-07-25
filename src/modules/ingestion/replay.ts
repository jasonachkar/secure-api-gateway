/**
 * Shared replay-through-pipeline logic: load a known fixture -> parse ->
 * normalize -> store (dedup) -> detect -> correlate. Used by both the
 * POST /admin/security/replay endpoint and the guided AWS/GCP scenarios,
 * so scenarios are not a separate simplified simulation - they drive the
 * same parse/detect/correlate code path as a manual replay.
 */
import { parseProviderEvent } from './parsers/index.js';
import { loadFixture } from './fixture-loader.js';
import type { SecurityEventStore } from './security-event.store.js';
import type { DetectionEngine } from '../detection/engine.js';
import type { DetectionStore } from '../detection/detection.store.js';
import type { InvestigationService } from '../investigations/investigation.service.js';
import type { PipelineMetrics } from '../security/pipeline-metrics.js';
import type { DetectionResult, NormalizedSecurityEvent, SecurityInvestigation } from '../security/types.js';

export interface ReplayDeps {
  securityEventStore: SecurityEventStore;
  detectionEngine: DetectionEngine;
  detectionStore: DetectionStore;
  investigationService: InvestigationService;
  pipelineMetrics: PipelineMetrics;
}

export interface ReplayResult {
  event: NormalizedSecurityEvent;
  duplicate: boolean;
  detections: DetectionResult[];
  investigations: SecurityInvestigation[];
}

export async function replayFixtureThroughPipeline(deps: ReplayDeps, fixtureId: string): Promise<ReplayResult> {
  const { securityEventStore, detectionEngine, detectionStore, investigationService, pipelineMetrics } = deps;
  const { provider, payload } = loadFixture(fixtureId);

  let event: NormalizedSecurityEvent;
  try {
    event = parseProviderEvent(provider, payload, 'replay');
  } catch (error) {
    await securityEventStore.saveParserFailure({
      provider,
      sourceService: fixtureId,
      occurredAt: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown parser error',
      provenance: 'replay',
      rawEvent: payload as Record<string, unknown>,
    });
    await pipelineMetrics.recordParserFailure();
    throw error;
  }

  const { event: saved, duplicate } = await securityEventStore.saveEvent(event);
  await pipelineMetrics.recordIngested(provider);
  if (duplicate) {
    await pipelineMetrics.recordDuplicate();
    return { event: saved, duplicate: true, detections: [], investigations: [] };
  }

  const detections = await detectionEngine.evaluate(saved);
  await detectionStore.saveAll(detections);
  const investigations: SecurityInvestigation[] = [];
  for (const detection of detections) {
    investigations.push(await investigationService.correlate(saved, detection));
  }

  return { event: saved, duplicate: false, detections, investigations };
}
