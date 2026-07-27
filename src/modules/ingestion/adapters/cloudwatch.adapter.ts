/**
 * AWS CloudWatch Logs ingestion adapter.
 *
 * Polls a single CloudWatch Logs log group on an interval, unwraps each log event's
 * message into a provider-native AWS record (CloudTrail/WAF/API Gateway), and feeds it
 * through the canonical security ingestion pipeline (security-ingestion.pipeline.ts) -
 * the same parse -> normalize -> detect -> correlate path replay and guided scenarios
 * use. Credentials come from the AWS SDK's standard env-var credential chain
 * (AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY/AWS_REGION) - nothing is wired explicitly here.
 */

import {
  CloudWatchLogsClient,
  FilterLogEventsCommand,
  type FilteredLogEvent,
} from '@aws-sdk/client-cloudwatch-logs';
import { logger } from '../../../lib/logger.js';
import type { IngestionAdapter } from './base.adapter.js';
import type { IngestionAdapterStatus } from '../normalized-event.types.js';
import type { NormalizedEventStore } from '../normalized-event.store.js';

const CURSOR_KEY = 'cloudwatch';
const DEFAULT_LOOKBACK_MS = 60 * 60 * 1000; // first poll: only look back 1h, not the whole log group's history
const MAX_CONSECUTIVE_FAILURES = 3;

/** Result the injected ingest function reports back for one record. */
export interface AdapterIngestOutcome {
  duplicate: boolean;
}

/** Bound canonical-pipeline call: parse this raw AWS record, ingest it, detect, correlate. Throws on parser failure (already recorded/redacted by the pipeline) so the caller can skip just that record. */
export type IngestAwsRecord = (raw: unknown) => Promise<AdapterIngestOutcome>;

export class CloudWatchAdapter implements IngestionAdapter {
  public readonly name = 'AWS CloudWatch';
  private readonly configured: boolean;
  private readonly client?: CloudWatchLogsClient;
  private intervalId: NodeJS.Timeout | null = null;
  private consecutiveFailures = 0;
  private lastError?: string;
  private lastSyncAt?: number;
  private eventsReceived = 0;
  private eventsIngested = 0;
  private parserFailures = 0;
  private duplicatesDiscarded = 0;
  private lastEventAt?: number;

  constructor(
    private readonly logGroup: string | undefined,
    region: string | undefined,
    private readonly cursorStore: NormalizedEventStore,
    private readonly ingest: IngestAwsRecord,
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
      eventsReceived: this.eventsReceived,
      eventsIngested: this.eventsIngested,
      parserFailures: this.parserFailures,
      duplicatesDiscarded: this.duplicatesDiscarded,
      lastEventAt: this.lastEventAt,
      cursor: this.configured ? await this.cursorStore.getCursor(CURSOR_KEY) : undefined,
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
      const cursor = await this.cursorStore.getCursor(CURSOR_KEY);
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
          eventCount += 1;
          if (event.timestamp && event.timestamp + 1 > latestTimestamp) {
            latestTimestamp = event.timestamp + 1;
          }
          await this.ingestLogEvent(event);
        }

        nextToken = response.nextToken;
      } while (nextToken);

      if (eventCount > 0) {
        await this.cursorStore.setCursor(CURSOR_KEY, String(latestTimestamp));
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

  /**
   * Ingest one CloudWatch Logs event. A single malformed/unparseable record must never
   * abort the rest of the poll - each record gets its own try/catch, and a failure is
   * tracked (both here and, redacted, in the canonical pipeline's parser-failure store)
   * rather than silently dropped or allowed to kill the batch.
   */
  private async ingestLogEvent(event: FilteredLogEvent): Promise<void> {
    this.eventsReceived += 1;
    const records = this.unwrapMessage(event.message);

    for (const record of records) {
      try {
        const outcome = await this.ingest(record);
        if (outcome.duplicate) {
          this.duplicatesDiscarded += 1;
        } else {
          this.eventsIngested += 1;
        }
        this.lastEventAt = Date.now();
      } catch (error) {
        this.parserFailures += 1;
        logger.warn({ error, adapter: this.name, eventId: event.eventId }, 'Failed to ingest CloudWatch record - skipping');
      }
    }
  }

  /**
   * Unwrap a CloudWatch Logs message into one or more provider-native AWS records ready
   * for the AWS parser (parseAwsEvent). Handles the two shapes this project's Terraform
   * (terraform/modules/aws-logging) can produce: a single JSON-encoded CloudTrail/WAF/API
   * Gateway record per log event, or a CloudTrail "Records" envelope (the S3-delivery
   * format some subscription filters forward as-is). A message that isn't valid JSON is
   * still passed through - wrapped so the parser (and its failure path) sees an object -
   * rather than silently discarded, so genuinely malformed input is visible as a tracked,
   * redacted parser failure instead of just vanishing.
   */
  private unwrapMessage(message: string | undefined): unknown[] {
    if (!message) return [];

    let parsed: unknown;
    try {
      parsed = JSON.parse(message);
    } catch {
      return [{ unparseableMessage: message }];
    }

    if (
      parsed &&
      typeof parsed === 'object' &&
      !Array.isArray(parsed) &&
      Array.isArray((parsed as Record<string, unknown>).Records)
    ) {
      return (parsed as Record<string, unknown>).Records as unknown[];
    }

    return [parsed];
  }
}
