/**
 * Dashboard TypeScript types
 */

export interface MetricsSummary {
  requestsPerSecond: number;
  totalRequests: number;
  activeConnections: number;
  errorRate: number;
  authStats: {
    failedLogins: number;
    successfulLogins: number;
    accountLockouts: number;
    activeSessions: number;
  };
  rateLimitStats: {
    violations: number;
    topViolators: Array<{ ip: string; count: number }>;
  };
  responseTimeStats: {
    p50: number;
    p95: number;
    p99: number;
  };
  systemHealth: {
    redisConnected: boolean;
    uptime: number;
  };
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

export interface RequestLogEntry {
  timestamp: number;
  method: string;
  path: string;
  user: string;
  rbacDecision: 'allowed' | 'denied' | 'anonymous';
  rateLimitRemaining: number | null;
  statusCode: number;
  latencyMs: number;
}

export interface AuditLogEntry {
  id: string;
  timestamp: number;
  eventType: string;
  userId?: string;
  username?: string;
  ip: string;
  requestId: string;
  resource?: string;
  action?: string;
  success: boolean;
  message?: string;
  metadata?: Record<string, unknown>;
}

export interface AdminAuditLogEntry {
  id: string;
  timestamp: number;
  actor: {
    userId: string;
    username: string;
  };
  action: string;
  resource: string;
  incidentId?: string;
  metadata?: Record<string, unknown>;
}

export interface SessionInfo {
  jti: string;
  userId: string;
  username: string;
  roles: string[];
  createdAt: number;
  expiresAt: number;
  lastUsedAt?: number;
  rotationCount: number;
  lastKnownIp: string;
  ipChangedAtLastRotation: boolean;
}

export interface UserInfo {
  userId: string;
  username: string;
  roles: string[];
  permissions: string[];
  lockout?: {
    isLocked: boolean;
    attempts: number;
    expiresAt?: number;
  };
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  accessToken: string;
  expiresIn: number;
  tokenType: string;
}

export interface RuntimeConfig {
  demoMode: boolean;
}

// Threat Intelligence Types

export type ThreatLevel = 'low' | 'medium' | 'high' | 'critical';

export interface IPThreatInfo {
  ip: string;
  threatScore: number;
  threatLevel: ThreatLevel;
  firstSeen: number;
  lastSeen: number;
  totalEvents: number;
  eventTypes: {
    failedLogins: number;
    rateLimitViolations: number;
    suspiciousActivity: number;
    accountLockouts: number;
  };
  geo: {
    country?: string;
    region?: string;
    city?: string;
    ll?: [number, number];
    timezone?: string;
  } | null;
  isBlocked: boolean;
  abuseScore?: number;
}

export interface AttackPattern {
  type: 'brute_force' | 'credential_stuffing' | 'rate_limit_abuse' | 'suspicious_behavior';
  severity: ThreatLevel;
  ipAddresses: string[];
  eventCount: number;
  timeWindow: number;
  description: string;
}

export interface ThreatStatistics {
  totalThreats: number;
  blockedIPs: number;
  criticalThreats: number;
  highThreats: number;
  mediumThreats: number;
  lowThreats: number;
  topCountries: Array<{ country: string; count: number }>;
}

// Compliance Types

export interface SecurityPosture {
  overallScore: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  factors: {
    authentication: {
      score: number;
      status: 'excellent' | 'good' | 'fair' | 'poor';
      details: {
        failedLoginRate: number;
        accountLockouts: number;
        mfaEnabled: boolean;
        sessionSecurity: number;
      };
    };
    threatIntelligence: {
      score: number;
      status: 'excellent' | 'good' | 'fair' | 'poor';
      details: {
        criticalThreats: number;
        blockedIPs: number;
        threatResponseTime: number;
      };
    };
    rateLimiting: {
      score: number;
      status: 'excellent' | 'good' | 'fair' | 'poor';
      details: {
        violations: number;
        coverage: number;
      };
    };
    auditLogging: {
      score: number;
      status: 'excellent' | 'good' | 'fair' | 'poor';
      details: {
        logCoverage: number;
        retentionDays: number;
      };
    };
    incidentResponse: {
      score: number;
      status: 'excellent' | 'good' | 'fair' | 'poor';
      details: {
        openIncidents: number;
        avgResponseTime: number;
        avgResolutionTime: number;
      };
    };
  };
  recommendations: string[];
  lastUpdated: number;
}

// 'partially-live' = at least one factor reflects live runtime telemetry;
// 'static' = a fixed, code-reviewed self-assessment, not a continuous measurement
// or third-party audit. Always render assessmentNote alongside the score.
export type ComplianceAssessmentBasis = 'partially-live' | 'static';

export interface ComplianceMetrics {
  nist: {
    score: number;
    assessmentBasis: ComplianceAssessmentBasis;
    assessmentNote: string;
    controls: Array<{
      id: string;
      name: string;
      status: 'compliant' | 'partial' | 'non-compliant';
      evidence: string[];
    }>;
  };
  owasp: {
    score: number;
    assessmentBasis: ComplianceAssessmentBasis;
    assessmentNote: string;
    top10: Array<{
      risk: string;
      status: 'mitigated' | 'partial' | 'vulnerable';
      description: string;
    }>;
  };
  pci: {
    score: number;
    assessmentBasis: ComplianceAssessmentBasis;
    assessmentNote: string;
    requirements: Array<{
      id: string;
      name: string;
      status: 'compliant' | 'non-compliant';
    }>;
  };
  gdpr: {
    score: number;
    assessmentBasis: ComplianceAssessmentBasis;
    assessmentNote: string;
    principles: Array<{
      principle: string;
      status: 'compliant' | 'partial' | 'non-compliant';
      description: string;
    }>;
  };
}

// ── Security control plane (capabilities, detection, investigations, scenarios) ──

export type DataProvenance = 'live' | 'replay' | 'synthetic' | 'planned';
export type ResponseExecutionMode = 'enforced' | 'simulated' | 'manual' | 'disabled';
export type CloudProvider = 'azure' | 'aws' | 'gcp' | 'gateway';
export type SecuritySeverity = 'informational' | 'low' | 'medium' | 'high' | 'critical';
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

export interface CapabilitySummary {
  total: number;
  counts: Record<CapabilityStatus, number>;
  capabilities: CapabilityDefinition[];
  jwtAlgorithm: string;
  demoMode: boolean;
  cloudSources: {
    aws: { mode: string; logGroupConfigured: boolean };
    gcp: { mode: string; projectConfigured: boolean };
    azure: { mode: string; sentinelConnected: boolean; note: string };
  };
}

export interface NormalizedSecurityEvent {
  id: string;
  schemaVersion: string;
  providerEventId: string;
  provider: CloudProvider;
  sourceService: string;
  occurredAt: string;
  ingestedAt: string;
  ingestionDelayMs: number;
  accountOrProjectId?: string;
  region?: string;
  principal?: { id?: string; type?: string; displayName?: string; email?: string };
  resource?: { id?: string; type?: string; name?: string; accountOrProjectId?: string; region?: string };
  action: string;
  outcome: 'success' | 'failure' | 'unknown';
  sourceIp?: string;
  userAgent?: string;
  severity: SecuritySeverity;
  category: string;
  title: string;
  summary: string;
  provenance: DataProvenance;
  correlationId?: string;
  detectionRuleIds: string[];
  evidence: Array<{ type: string; label: string; reference: string }>;
  dedupeHash: string;
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

export type InvestigationStatus = 'open' | 'investigating' | 'contained' | 'resolved' | 'closed';

export interface InvestigationTimelineEntry {
  id: string;
  timestamp: string;
  type: string;
  summary: string;
  actor: string;
  provenance: DataProvenance;
  source?: string;
  metadata?: Record<string, unknown>;
}

export interface ResponseActionRecord {
  id: string;
  action: string;
  mode: ResponseExecutionMode;
  target?: string;
  actor: string;
  reason: string;
  result: 'success' | 'failure' | 'skipped';
  correlationId?: string;
  investigationId?: string;
  timestamp: string;
  details?: Record<string, unknown>;
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
  affectedPrincipals: Array<{ id?: string; type?: string; displayName?: string; email?: string }>;
  affectedResources: Array<{ id?: string; type?: string; name?: string }>;
  sourceIps: string[];
  provenance: DataProvenance;
  correlationKey: string;
  correlationExplanation: string;
  timeline: InvestigationTimelineEntry[];
  responseActions: ResponseActionRecord[];
  evidence: Array<{ type: string; label: string; reference: string }>;
  summary: string;
  whyItMatters: string;
}

export type OperationalHealth = 'healthy' | 'degraded' | 'unavailable' | 'replay_only' | 'not_configured';

export interface PipelineMetricsSnapshot {
  eventsIngestedByProvider: Record<string, number>;
  eventsNormalized: number;
  duplicatesDiscarded: number;
  parserFailures: number;
  detectionEvaluations: number;
  detectionMatches: number;
  investigationsCreated: number;
  investigationDeduplications: number;
  responseActionSuccess: number;
  responseActionFailure: number;
  deadLetterCount: number;
  averageIngestionDelayMs: number;
  lastSuccessfulProviderPoll: Record<string, number>;
  consecutiveProviderFailures: Record<string, number>;
  healthByProvider: Record<CloudProvider, OperationalHealth>;
}

export type ScenarioId = 'gw-credential-attack' | 'aws-privileged-activity' | 'gcp-credential-persistence';
export type ScenarioStepId = 'generate' | 'normalize' | 'detect' | 'correlate' | 'respond' | 'verify';

export interface ScenarioStep {
  id: ScenarioStepId;
  label: string;
  status: 'completed' | 'skipped' | 'failed';
  summary: string;
  detail?: Record<string, unknown>;
}

export interface ScenarioDefinition {
  id: ScenarioId;
  name: string;
  description: string;
  provenance: DataProvenance;
  provider: CloudProvider;
  steps: Array<{ id: ScenarioStepId; label: string; description: string }>;
  expectedOutcome: string;
  safeForReviewer: boolean;
}

export interface ScenarioRunResult {
  scenarioId: ScenarioId;
  provenance: DataProvenance;
  startedAt: string;
  completedAt: string;
  correlationId: string;
  steps: ScenarioStep[];
  eventIds: string[];
  detectionIds: string[];
  investigationIds: string[];
}

export interface EvidencePackage {
  'investigation.json': SecurityInvestigation;
  'normalized-events.json': NormalizedSecurityEvent[];
  'detections.json': DetectionResult[];
  'response-actions.json': ResponseActionRecord[];
  'audit-verification.json': {
    chainValid: boolean;
    entriesVerified: number;
    firstInvalidEntryId: string | null;
    tamperEvidenceModel: string;
    limitation: string;
    relatedAuditEntries: AuditLogEntry[];
  };
  'README.txt': string;
}
