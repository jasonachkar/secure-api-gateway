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
