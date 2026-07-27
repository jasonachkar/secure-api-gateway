/**
 * Live cloud ingestion: owns the AWS/GCP polling adapters' lifecycle and wires each one's
 * raw provider records into the canonical security ingestion pipeline
 * (security-ingestion.pipeline.ts) - the exact same parse -> normalize -> detect ->
 * correlate path fixture replay and guided scenarios use. There is no separate "live"
 * pipeline: only the source of the raw payload (a live poll vs. a fixture) and the
 * provenance tag ('live' vs 'replay') differ.
 */

import Redis from 'ioredis';
import { env } from '../../config/index.js';
import { CloudWatchAdapter } from './adapters/cloudwatch.adapter.js';
import { GcpLoggingAdapter } from './adapters/gcp-logging.adapter.js';
import { AzureSentinelAdapter } from './adapters/azure-sentinel.adapter.js';
import type { IngestionAdapter } from './adapters/base.adapter.js';
import type { IngestionStatus } from './normalized-event.types.js';
import { NormalizedEventStore } from './normalized-event.store.js';
import { ingestProviderEvent, type SecurityIngestionPipelineDeps } from './security-ingestion.pipeline.js';

export class IngestionService {
  /** Cursor persistence only (per-adapter "last polled up to" position, Redis-only) - event storage/detection goes through pipelineDeps.securityEventStore, not this store. */
  private readonly cursorStore: NormalizedEventStore;
  private readonly adapters: IngestionAdapter[];

  constructor(
    redis: Redis,
    private readonly pipelineDeps: SecurityIngestionPipelineDeps
  ) {
    this.cursorStore = new NormalizedEventStore(redis);

    this.adapters = [
      new CloudWatchAdapter(
        env.ingestion.cloudwatchLogGroup,
        env.ingestion.awsRegion,
        this.cursorStore,
        (raw) => this.ingest('aws', raw, env.ingestion.cloudwatchLogGroup),
        env.ingestion.pollIntervalMs
      ),
      new GcpLoggingAdapter(
        env.ingestion.gcpLoggingProject,
        env.ingestion.gcpServiceAccountKey,
        this.cursorStore,
        (raw) => this.ingest('gcp', raw, env.ingestion.gcpLoggingProject),
        env.ingestion.pollIntervalMs
      ),
      // Azure has no live connector implemented - see docs/CLOUD_INGESTION.md for the
      // documented implementation path (Azure Monitor / Log Analytics / Event Hubs).
      // This adapter only ever reports its own configured/not-configured status; it
      // never polls or ingests anything, and must never be mistaken for a working
      // Sentinel connection.
      new AzureSentinelAdapter(Boolean(env.ingestion.azureSentinelWorkspace)),
    ];
  }

  private async ingest(
    provider: 'aws' | 'gcp',
    raw: unknown,
    sourceServiceOnFailure: string | undefined
  ): Promise<{ duplicate: boolean }> {
    const result = await ingestProviderEvent(this.pipelineDeps, {
      provider,
      raw,
      provenance: 'live',
      sourceServiceOnFailure,
    });
    return { duplicate: result.duplicate };
  }

  start(): void {
    for (const adapter of this.adapters) {
      adapter.start?.();
    }
  }

  stop(): void {
    for (const adapter of this.adapters) {
      adapter.stop?.();
    }
  }

  async getStatus(): Promise<IngestionStatus> {
    const [storage, adapterStatuses] = await Promise.all([
      this.pipelineDeps.securityEventStore.getStorageStatus(),
      Promise.all(this.adapters.map((adapter) => adapter.getStatus())),
    ]);

    return {
      adapters: adapterStatuses,
      storage,
    };
  }
}
