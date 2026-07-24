/**
 * Ingestion service for normalized security events
 */

import Redis from 'ioredis';
import { nanoid } from 'nanoid';
import { env } from '../../config/index.js';
import { CloudWatchAdapter } from './adapters/cloudwatch.adapter.js';
import { GcpLoggingAdapter } from './adapters/gcp-logging.adapter.js';
import { AzureSentinelAdapter } from './adapters/azure-sentinel.adapter.js';
import type { IngestionAdapter } from './adapters/base.adapter.js';
import type { NormalizedEvent, IngestionStatus } from './normalized-event.types.js';
import { NormalizedEventStore, type PostgresClient } from './normalized-event.store.js';
import type { IncidentResponseService } from '../admin/incident-response.service.js';

export class IngestionService {
  private readonly store: NormalizedEventStore;
  private readonly adapters: IngestionAdapter[];

  constructor(
    redis: Redis,
    private readonly incidentService: IncidentResponseService,
    postgres?: PostgresClient
  ) {
    this.store = new NormalizedEventStore(redis, postgres);
    const onEvent = async (event: Omit<NormalizedEvent, 'id'>): Promise<void> => {
      await this.ingestEvent(event);
    };

    this.adapters = [
      new CloudWatchAdapter(
        env.ingestion.cloudwatchLogGroup,
        env.ingestion.awsRegion,
        this.store,
        onEvent,
        env.ingestion.pollIntervalMs
      ),
      new GcpLoggingAdapter(
        env.ingestion.gcpLoggingProject,
        env.ingestion.gcpServiceAccountKey,
        this.store,
        onEvent,
        env.ingestion.pollIntervalMs
      ),
      new AzureSentinelAdapter(Boolean(env.ingestion.azureSentinelWorkspace)),
    ];
  }

  async initialize(): Promise<void> {
    await this.store.initialize();
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

  async ingestEvent(event: Omit<NormalizedEvent, 'id'> & { id?: string }): Promise<NormalizedEvent> {
    const normalizedEvent: NormalizedEvent = {
      ...event,
      id: event.id || nanoid(),
    };

    await this.store.saveEvent(normalizedEvent);
    await this.incidentService.createIncidentFromNormalizedEvent(normalizedEvent, 'ingestion');

    return normalizedEvent;
  }

  async getStatus(): Promise<IngestionStatus> {
    const [storage, adapterStatuses] = await Promise.all([
      this.store.getStatus(),
      Promise.all(this.adapters.map(adapter => adapter.getStatus())),
    ]);

    return {
      adapters: adapterStatuses,
      storage,
    };
  }
}
