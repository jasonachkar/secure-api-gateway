/**
 * Normalized event schema for ingestion pipeline
 */

export type NormalizedEventSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface NormalizedEvent {
  id: string;
  event_type: string;
  source: string;
  timestamp: number;
  severity: NormalizedEventSeverity;
  payload: Record<string, unknown>;
}

export interface IngestionAdapterStatus {
  name: string;
  provider: 'cloudwatch' | 'gcp_logging' | 'azure_sentinel';
  healthy: boolean;
  configured: boolean;
  lastSyncAt?: number;
  detail?: string;
  /** Raw provider records received across all polls (before parsing) - not the same as eventsIngested, which excludes parser failures and duplicates. */
  eventsReceived?: number;
  eventsIngested?: number;
  parserFailures?: number;
  duplicatesDiscarded?: number;
  lastEventAt?: number;
  /** Opaque cursor position (adapter-specific: a timestamp for CloudWatch/GCP), for operator visibility - not meant to be parsed by callers. */
  cursor?: string | null;
}

export interface IngestionStorageStatus {
  redisConnected: boolean;
  postgresConnected: boolean;
  totalEvents: number;
  lastEventAt?: number;
}

export interface IngestionStatus {
  adapters: IngestionAdapterStatus[];
  storage: IngestionStorageStatus;
}
