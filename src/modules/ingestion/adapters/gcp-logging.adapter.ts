/**
 * GCP Cloud Logging ingestion adapter.
 *
 * Polls a project's Cloud Logging entries (Cloud Audit Logs) on an interval, reshapes
 * each entry into the provider-native record shape the GCP parser (parseGcpEvent)
 * expects, and feeds it through the canonical security ingestion pipeline
 * (security-ingestion.pipeline.ts) - the same parse -> normalize -> detect -> correlate
 * path replay and guided scenarios use. Every GCP project already has a default log sink
 * capturing activity/audit logs, so no log source needs to be provisioned - only a
 * read-only (roles/logging.viewer) service account.
 */

import { Logging, type Entry } from '@google-cloud/logging';
import { logger } from '../../../lib/logger.js';
import type { IngestionAdapter } from './base.adapter.js';
import type { IngestionAdapterStatus } from '../normalized-event.types.js';
import type { NormalizedEventStore } from '../normalized-event.store.js';

const CURSOR_KEY = 'gcp_logging';
const DEFAULT_LOOKBACK_MS = 60 * 60 * 1000; // first poll: only look back 1h
const MAX_CONSECUTIVE_FAILURES = 3;

export interface AdapterIngestOutcome {
  duplicate: boolean;
}

/** Bound canonical-pipeline call: parse this raw GCP record, ingest it, detect, correlate. Throws on parser failure (already recorded/redacted by the pipeline) so the caller can skip just that record. */
export type IngestGcpRecord = (raw: unknown) => Promise<AdapterIngestOutcome>;

export class GcpLoggingAdapter implements IngestionAdapter {
  public readonly name = 'GCP Logging';
  private configured: boolean;
  private readonly client?: Logging;
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
    private readonly projectId: string | undefined,
    serviceAccountKeyJson: string | undefined,
    private readonly cursorStore: NormalizedEventStore,
    private readonly ingest: IngestGcpRecord,
    private readonly pollIntervalMs: number
  ) {
    this.configured = Boolean(projectId && serviceAccountKeyJson);

    if (this.configured) {
      try {
        const credentials = JSON.parse(serviceAccountKeyJson as string);
        this.client = new Logging({ projectId, credentials });
      } catch (error) {
        // Malformed key JSON degrades to "not configured" rather than crashing boot -
        // this is an optional feature, so a bad value shouldn't take down the app.
        this.configured = false;
        logger.warn({ error }, 'GCP_SERVICE_ACCOUNT_KEY is not valid JSON; GCP Logging adapter disabled');
      }
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
      provider: 'gcp_logging',
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
    if (!this.configured) return 'Missing GCP Logging configuration';
    if (this.lastError) return `Last poll failed: ${this.lastError}`;
    if (this.lastSyncAt) return `Ready to ingest - last synced ${new Date(this.lastSyncAt).toLocaleTimeString()}`;
    return 'Ready to ingest - waiting for first poll';
  }

  private async poll(): Promise<void> {
    if (!this.client) return;

    try {
      const cursor = await this.cursorStore.getCursor(CURSOR_KEY);
      const startTime = cursor ? Number(cursor) : Date.now() - DEFAULT_LOOKBACK_MS;
      const filter = `timestamp >= "${new Date(startTime).toISOString()}"`;

      const [entries] = await this.client.getEntries({
        filter,
        orderBy: 'timestamp asc',
        pageSize: 100,
      });

      let latestTimestamp = startTime;

      for (const entry of entries) {
        const timestamp = this.entryTimestamp(entry);
        if (timestamp + 1 > latestTimestamp) {
          latestTimestamp = timestamp + 1;
        }
        await this.ingestEntry(entry);
      }

      if (entries.length > 0) {
        await this.cursorStore.setCursor(CURSOR_KEY, String(latestTimestamp));
      }

      this.consecutiveFailures = 0;
      this.lastError = undefined;
      this.lastSyncAt = Date.now();
    } catch (error) {
      this.consecutiveFailures += 1;
      this.lastError = error instanceof Error ? error.message : 'Unknown error';
      logger.warn({ error, adapter: this.name }, 'GCP Logging poll failed');
    }
  }

  private entryTimestamp(entry: Entry): number {
    const timestamp = entry.metadata?.timestamp;
    if (!timestamp) return Date.now();
    return timestamp instanceof Date ? timestamp.getTime() : new Date(timestamp as string).getTime();
  }

  /**
   * Ingest one Cloud Logging entry. A single malformed/unparseable entry must never
   * abort the rest of the poll - each entry gets its own try/catch, and a failure is
   * tracked (both here and, redacted, in the canonical pipeline's parser-failure store)
   * rather than silently dropped or allowed to kill the batch.
   */
  private async ingestEntry(entry: Entry): Promise<void> {
    this.eventsReceived += 1;

    try {
      const outcome = await this.ingest(this.toProviderRecord(entry));
      if (outcome.duplicate) {
        this.duplicatesDiscarded += 1;
      } else {
        this.eventsIngested += 1;
      }
      this.lastEventAt = Date.now();
    } catch (error) {
      this.parserFailures += 1;
      logger.warn({ error, adapter: this.name, insertId: entry.metadata?.insertId }, 'Failed to ingest GCP log entry - skipping');
    }
  }

  /**
   * Reshape a Cloud Logging Entry into the flat record shape the GCP parser
   * (parseGcpEvent) expects: entry metadata (insertId/logName/timestamp/severity/
   * resource) at the top level, with the entry's structured payload - protoPayload for
   * Cloud Audit Logs, which is what this adapter's filter targets - nested under
   * `protoPayload`, exactly as it appears in the GCP API's native JSON representation.
   *
   * The client library hands back `metadata.timestamp` as a JS `Date` (its parsed form
   * of the API's RFC3339 string), but parseGcpEvent - shared with replay fixtures, which
   * are plain JSON and so always carry `timestamp` as a string - only accepts a string.
   * Re-serializing here keeps the parser's contract uniform across live and replay
   * inputs instead of teaching it to special-case a Date.
   */
  private toProviderRecord(entry: Entry): Record<string, unknown> {
    const timestamp = entry.metadata?.timestamp;
    return {
      insertId: entry.metadata?.insertId,
      logName: entry.metadata?.logName,
      timestamp: timestamp instanceof Date ? timestamp.toISOString() : timestamp,
      severity: entry.metadata?.severity,
      resource: entry.metadata?.resource,
      protoPayload: entry.data,
    };
  }
}
