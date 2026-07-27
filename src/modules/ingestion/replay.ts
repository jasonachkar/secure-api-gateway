/**
 * Load a known replay fixture and run it through the canonical ingestion pipeline
 * (security-ingestion.pipeline.ts). Used by both the POST /admin/security/replay
 * endpoint and the guided AWS/GCP scenarios, so scenarios are not a separate
 * simplified simulation - they drive the exact same parse/detect/correlate code
 * path as a manual replay, and the exact same path live adapters use.
 */
import { loadFixture } from './fixture-loader.js';
import { ingestProviderEvent, type IngestProviderEventResult, type SecurityIngestionPipelineDeps } from './security-ingestion.pipeline.js';

export type ReplayDeps = SecurityIngestionPipelineDeps;
export type ReplayResult = IngestProviderEventResult;

export async function replayFixtureThroughPipeline(deps: ReplayDeps, fixtureId: string): Promise<ReplayResult> {
  const { provider, payload } = loadFixture(fixtureId);
  return ingestProviderEvent(deps, {
    provider,
    raw: payload,
    provenance: 'replay',
    sourceServiceOnFailure: fixtureId,
  });
}
