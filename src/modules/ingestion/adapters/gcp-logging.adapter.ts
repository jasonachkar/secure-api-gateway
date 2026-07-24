/**
 * GCP Cloud Logging ingestion adapter.
 *
 * Polls a project's Cloud Logging entries on an interval and feeds matching entries
 * through the normalized-event pipeline. Every GCP project already has a default log
 * sink capturing activity/audit logs, so no log source needs to be provisioned - only a
 * read-only (roles/logging.viewer) service account.
 */

import { Logging, type Entry } from '@google-cloud/logging';
import { logger } from '../../../lib/logger.js';
import type { IngestionAdapter } from './base.adapter.js';
import type {
  IngestionAdapterStatus,
  NormalizedEvent,
  NormalizedEventSeverity,
} from '../normalized-event.types.js';
import type { NormalizedEventStore } from '../normalized-event.store.js';

const CURSOR_KEY = 'gcp_logging';
const DEFAULT_LOOKBACK_MS = 60 * 60 * 1000; // first poll: only look back 1h
const MAX_CONSECUTIVE_FAILURES = 3;

const GCP_SEVERITY_MAP: Record<string, NormalizedEventSeverity> = {
  DEFAULT: 'low',
  DEBUG: 'low',
  INFO: 'low',
  NOTICE: 'low',
  WARNING: 'medium',
  ERROR: 'high',
  CRITICAL: 'critical',
  ALERT: 'critical',
  EMERGENCY: 'critical',
};

export class GcpLoggingAdapter implements IngestionAdapter {
  public readonly name = 'GCP Logging';
  private configured: boolean;
  private readonly client?: Logging;
  private intervalId: NodeJS.Timeout | null = null;
  private consecutiveFailures = 0;
  private lastError?: string;
  private lastSyncAt?: number;

  constructor(
    private readonly projectId: string | undefined,
    serviceAccountKeyJson: string | undefined,
    private readonly store: NormalizedEventStore,
    private readonly onEvent: (event: Omit<NormalizedEvent, 'id'>) => Promise<void>,
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
      const cursor = await this.store.getCursor(CURSOR_KEY);
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
        await this.onEvent(this.toNormalizedEvent(entry, timestamp));
        if (timestamp + 1 > latestTimestamp) {
          latestTimestamp = timestamp + 1;
        }
      }

      if (entries.length > 0) {
        await this.store.setCursor(CURSOR_KEY, String(latestTimestamp));
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

  private toNormalizedEvent(entry: Entry, timestamp: number): Omit<NormalizedEvent, 'id'> {
    const gcpSeverity = String(entry.metadata?.severity ?? 'DEFAULT');

    return {
      event_type: 'gcp_log',
      source: entry.metadata?.logName || this.projectId || 'gcp_logging',
      timestamp,
      severity: GCP_SEVERITY_MAP[gcpSeverity] ?? 'low',
      payload: {
        logName: entry.metadata?.logName,
        data: entry.data,
      },
    };
  }
}
