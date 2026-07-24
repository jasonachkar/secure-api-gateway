/**
 * AWS CloudWatch Logs ingestion adapter.
 *
 * Polls a single CloudWatch Logs log group on an interval and feeds matching entries
 * through the normalized-event pipeline. Credentials come from the AWS SDK's standard
 * env-var credential chain (AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY/AWS_REGION) - nothing
 * is wired explicitly here.
 */

import {
  CloudWatchLogsClient,
  FilterLogEventsCommand,
  type FilteredLogEvent,
} from '@aws-sdk/client-cloudwatch-logs';
import { logger } from '../../../lib/logger.js';
import type { IngestionAdapter } from './base.adapter.js';
import type { IngestionAdapterStatus, NormalizedEvent } from '../normalized-event.types.js';
import type { NormalizedEventStore } from '../normalized-event.store.js';

const CURSOR_KEY = 'cloudwatch';
const DEFAULT_LOOKBACK_MS = 60 * 60 * 1000; // first poll: only look back 1h, not the whole log group's history
const MAX_CONSECUTIVE_FAILURES = 3;

export class CloudWatchAdapter implements IngestionAdapter {
  public readonly name = 'AWS CloudWatch';
  private readonly configured: boolean;
  private readonly client?: CloudWatchLogsClient;
  private intervalId: NodeJS.Timeout | null = null;
  private consecutiveFailures = 0;
  private lastError?: string;
  private lastSyncAt?: number;

  constructor(
    private readonly logGroup: string | undefined,
    region: string | undefined,
    private readonly store: NormalizedEventStore,
    private readonly onEvent: (event: Omit<NormalizedEvent, 'id'>) => Promise<void>,
    private readonly pollIntervalMs: number
  ) {
    this.configured = Boolean(logGroup && region);
    if (this.configured) {
      this.client = new CloudWatchLogsClient({ region });
    }
  }

  start(): void {
    if (!this.configured || this.intervalId) return;
    this.intervalId = setInterval(() => {
      void this.poll();
    }, this.pollIntervalMs);
    void this.poll();
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  async getStatus(): Promise<IngestionAdapterStatus> {
    return {
      name: this.name,
      provider: 'cloudwatch',
      healthy: this.configured && this.consecutiveFailures < MAX_CONSECUTIVE_FAILURES,
      configured: this.configured,
      lastSyncAt: this.lastSyncAt,
      detail: this.statusDetail(),
    };
  }

  private statusDetail(): string {
    if (!this.configured) return 'Missing CloudWatch configuration';
    if (this.lastError) return `Last poll failed: ${this.lastError}`;
    if (this.lastSyncAt) return `Ready to ingest - last synced ${new Date(this.lastSyncAt).toLocaleTimeString()}`;
    return 'Ready to ingest - waiting for first poll';
  }

  private async poll(): Promise<void> {
    if (!this.client || !this.logGroup) return;

    try {
      const cursor = await this.store.getCursor(CURSOR_KEY);
      const startTime = cursor ? Number(cursor) : Date.now() - DEFAULT_LOOKBACK_MS;
      let latestTimestamp = startTime;
      let nextToken: string | undefined;
      let eventCount = 0;

      do {
        const response = await this.client.send(
          new FilterLogEventsCommand({
            logGroupName: this.logGroup,
            startTime,
            nextToken,
            limit: 100,
          })
        );

        for (const event of response.events ?? []) {
          await this.onEvent(this.toNormalizedEvent(event));
          eventCount += 1;
          if (event.timestamp && event.timestamp + 1 > latestTimestamp) {
            latestTimestamp = event.timestamp + 1;
          }
        }

        nextToken = response.nextToken;
      } while (nextToken);

      if (eventCount > 0) {
        await this.store.setCursor(CURSOR_KEY, String(latestTimestamp));
      }

      this.consecutiveFailures = 0;
      this.lastError = undefined;
      this.lastSyncAt = Date.now();
    } catch (error) {
      this.consecutiveFailures += 1;
      this.lastError = error instanceof Error ? error.message : 'Unknown error';
      logger.warn({ error, adapter: this.name }, 'CloudWatch poll failed');
    }
  }

  private toNormalizedEvent(event: FilteredLogEvent): Omit<NormalizedEvent, 'id'> {
    return {
      event_type: 'cloudwatch_log',
      source: this.logGroup || 'cloudwatch',
      timestamp: event.timestamp ?? Date.now(),
      severity: 'low',
      payload: {
        logStreamName: event.logStreamName,
        message: event.message,
        eventId: event.eventId,
      },
    };
  }
}
