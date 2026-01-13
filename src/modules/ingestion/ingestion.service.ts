/**
 * Ingestion service for normalized security events
 */

import Redis from 'ioredis';
import { nanoid } from 'nanoid';
import { env } from '../../config/index.js';
import { CloudWatchAdapter } from './adapters/cloudwatch.adapter.js';
import { GcpLoggingAdapter } from './adapters/gcp-logging.adapter.js';
import { AzureSentinelAdapter } from './adapters/azure-sentinel.adapter.js';
import type {
  NormalizedEvent,
  IngestionStatus,
  IngestionAdapterStatus,
} from './normalized-event.types.js';
import { NormalizedEventStore, type PostgresClient } from './normalized-event.store.js';
import type { IncidentResponseService } from '../admin/incident-response.service.js';

export class IngestionService {
  private readonly store: NormalizedEventStore;
  private readonly adapters: Array<{ getStatus: () => Promise<IngestionAdapterStatus> }>;

  constructor(
    redis: Redis,
    private readonly incidentService: IncidentResponseService,
    postgres?: PostgresClient
  ) {
    this.store = new NormalizedEventStore(redis, postgres);
    this.adapters = [
      new CloudWatchAdapter(Boolean(env.CLOUDWATCH_LOG_GROUP)),
      new GcpLoggingAdapter(Boolean(env.GCP_LOGGING_PROJECT)),
      new AzureSentinelAdapter(Boolean(env.AZURE_SENTINEL_WORKSPACE)),
    ];
  }

  async initialize(): Promise<void> {
    await this.store.initialize();
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
