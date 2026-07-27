/**
 * Shared security control-plane types.
 * Provider-independent contracts used by ingestion, detection, investigations, and response.
 */

export type DataProvenance = 'live' | 'replay' | 'synthetic' | 'planned';

export type ResponseExecutionMode = 'enforced' | 'simulated' | 'manual' | 'disabled';

export type CloudProvider = 'azure' | 'aws' | 'gcp' | 'gateway';

export type SecuritySeverity =
  | 'informational'
  | 'low'
  | 'medium'
  | 'high'
  | 'critical';

export type SecurityEventCategory =
  | 'authentication'
  | 'authorization'
  | 'credential-access'
  | 'persistence'
  | 'privilege-escalation'
  | 'configuration-change'
  | 'network'
  | 'data-access'
  | 'rate-limit'
  | 'malicious-request'
  | 'availability'
  | 'audit-integrity'
  | 'other';

export type EventOutcome = 'success' | 'failure' | 'unknown';

export interface SecurityPrincipal {
  id?: string;
  type?: string;
  displayName?: string;
  email?: string;
}

export interface SecurityResource {
  id?: string;
  type?: string;
  name?: string;
  accountOrProjectId?: string;
  region?: string;
}

export interface EvidenceReference {
  type: 'raw-event' | 'audit-log' | 'request' | 'terraform' | 'test' | 'source-code';
  label: string;
  reference: string;
}

/** Canonical schema version for normalized security events */
export const SECURITY_EVENT_SCHEMA_VERSION = '1.0.0';

export interface NormalizedSecurityEvent {
  id: string;
  schemaVersion: string;
  providerEventId: string;
  provider: CloudProvider;
  sourceService: string;

  occurredAt: string;
  ingestedAt: string;
  /** Milliseconds between occurredAt and ingestedAt */
  ingestionDelayMs: number;

  accountOrProjectId?: string;
  region?: string;

  principal?: SecurityPrincipal;
  resource?: SecurityResource;

  action: string;
  outcome: EventOutcome;
  sourceIp?: string;
  userAgent?: string;

  severity: SecuritySeverity;
  category: SecurityEventCategory;

  title: string;
  summary: string;

  provenance: DataProvenance;
  correlationId?: string;
  detectionRuleIds: string[];
  evidence: EvidenceReference[];

  /** Deterministic hash used for deduplication */
  dedupeHash: string;

  /** Sanitized original provider payload */
  rawEvent: Record<string, unknown>;
}

export interface ParserFailure {
  id: string;
  provider: CloudProvider;
  sourceService: string;
  occurredAt: string;
  ingestedAt: string;
  error: string;
  provenance: DataProvenance;
  rawEvent: Record<string, unknown>;
}

export interface DetectionResult {
  id: string;
  ruleId: string;
  ruleVersion: string;
  title: string;
  description: string;
  severity: SecuritySeverity;
  matchedFields: Record<string, unknown>;
  remediation: string[];
  evidenceEventIds: string[];
  correlationKey?: string;
  falsePositiveNotes?: string[];
  severityRationale?: string;
  createdAt: string;
  provenance: DataProvenance;
}

export type InvestigationStatus =
  | 'open'
  | 'investigating'
  | 'contained'
  | 'resolved'
  | 'closed';

export interface InvestigationTimelineEntry {
  id: string;
  timestamp: string;
  type:
    | 'event'
    | 'normalization'
    | 'detection'
    | 'investigation_created'
    | 'investigation_updated'
    | 'response_decision'
    | 'enforcement_result'
    | 'verification'
    | 'status_change'
    | 'note';
  summary: string;
  actor: string;
  provenance: DataProvenance;
  source?: string;
  metadata?: Record<string, unknown>;
}

export interface ResponseActionRecord {
  id: string;
  action:
    | 'block_ip'
    | 'unblock_ip'
    | 'revoke_sessions'
    | 'open_ticket'
    | 'disable_aws_identity'
    | 'disable_gcp_identity'
    | 'disable_entra_identity';
  mode: ResponseExecutionMode;
  target?: string;
  actor: string;
  reason: string;
  result: 'success' | 'failure' | 'skipped';
  correlationId?: string;
  investigationId?: string;
  timestamp: string;
  details?: Record<string, unknown>;
  auditEventId?: string;
}

export interface SecurityInvestigation {
  id: string;
  title: string;
  severity: SecuritySeverity;
  status: InvestigationStatus;
  createdAt: string;
  updatedAt: string;
  providerScopes: CloudProvider[];
  eventIds: string[];
  detectionIds: string[];
  affectedPrincipals: SecurityPrincipal[];
  affectedResources: SecurityResource[];
  sourceIps: string[];
  provenance: DataProvenance;
  correlationKey: string;
  correlationExplanation: string;
  timeline: InvestigationTimelineEntry[];
  responseActions: ResponseActionRecord[];
  evidence: EvidenceReference[];
  summary: string;
  whyItMatters: string;
}

export type OperationalHealth =
  | 'healthy'
  | 'degraded'
  | 'unavailable'
  | 'replay_only'
  | 'not_configured';

export type CapabilityStatus = 'implemented' | 'simulated' | 'partial' | 'planned';

export type CapabilityCategory =
  | 'gateway-protection'
  | 'cloud-ingestion'
  | 'detection'
  | 'response'
  | 'evidence'
  | 'platform-security';

export interface CapabilityDefinition {
  id: string;
  name: string;
  category: CapabilityCategory;
  status: CapabilityStatus;
  provenance?: DataProvenance;
  summary: string;
  limitations?: string[];
  implementationPaths: string[];
  testPaths: string[];
  infrastructurePaths?: string[];
}
