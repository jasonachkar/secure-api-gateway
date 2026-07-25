/**
 * Single source of truth for product capabilities and honesty status.
 * Exposed via API so UI and docs do not diverge.
 */

import type { CapabilityDefinition } from './types.js';
import { env } from '../../config/index.js';

export const CAPABILITY_REGISTRY: CapabilityDefinition[] = [
  {
    id: 'gateway-jwt-auth',
    name: 'Gateway JWT authentication',
    category: 'gateway-protection',
    status: 'implemented',
    provenance: 'live',
    summary:
      'Access and refresh token authentication with rotation, family revocation, and account lockout.',
    limitations: [
      `Deployed algorithm follows JWT_ALGORITHM (currently ${env.auth.jwt.algorithm}). RS256 is the recommended production default when PEM keys are configured.`,
      'Demo users are in-memory and reset on process restart.',
    ],
    implementationPaths: [
      'src/modules/auth/auth.service.ts',
      'src/modules/auth/token.store.ts',
      'src/middleware/auth.ts',
    ],
    testPaths: ['test/auth.integration.test.ts', 'test/tokenRotation.unit.test.ts'],
  },
  {
    id: 'gateway-rbac',
    name: 'Role-based access control',
    category: 'gateway-protection',
    status: 'implemented',
    provenance: 'live',
    summary: 'Role and permission checks on protected routes (admin/user/service roles). No dedicated reviewer role or restricted-access mode exists yet - see reviewer-demo-mode.',
    implementationPaths: ['src/middleware/rbac.ts', 'src/modules/auth/auth.service.ts'],
    testPaths: ['test/rbac.unit.test.ts'],
  },
  {
    id: 'gateway-rate-limit',
    name: 'Redis-backed rate limiting',
    category: 'gateway-protection',
    status: 'implemented',
    provenance: 'live',
    summary: 'Global, auth, user, and API-key rate limits fail closed when Redis is unavailable.',
    implementationPaths: ['src/middleware/rateLimit.ts'],
    testPaths: ['test/rateLimit.unit.test.ts', 'test/ratelimit.integration.test.ts'],
  },
  {
    id: 'gateway-ip-block',
    name: 'Blocked-IP enforcement',
    category: 'response',
    status: 'implemented',
    provenance: 'live',
    summary:
      'Redis-backed blocked IP set enforced early in the gateway request path (registered in app.ts, ahead of business routes) with audited 403 responses and a response-action record.',
    limitations: [
      'Fails open on Redis errors for this specific check (logged) - primary auth/rate-limit controls still apply. See ipBlock.ts.',
    ],
    implementationPaths: [
      'src/middleware/ipBlock.ts',
      'src/modules/admin/threat-intel.service.ts',
      'src/modules/response/response.service.ts',
    ],
    testPaths: ['test/ip-block.integration.test.ts'],
  },
  {
    id: 'gateway-session-revoke',
    name: 'Session family revocation',
    category: 'response',
    status: 'implemented',
    provenance: 'live',
    summary: 'Revokes all of a user\'s active refresh-token sessions (via a Redis user index) so revoked sessions cannot access protected routes.',
    implementationPaths: [
      'src/modules/auth/token.store.ts',
      'src/modules/response/response.service.ts',
    ],
    testPaths: ['test/session-revoke.integration.test.ts'],
  },
  {
    id: 'proxy-ssrf',
    name: 'SSRF-resistant upstream proxy',
    category: 'gateway-protection',
    status: 'implemented',
    provenance: 'live',
    summary: 'Host allowlist, DNS pinning, and private-IP blocking for upstream calls.',
    implementationPaths: ['src/lib/httpClient.ts', 'src/modules/proxy/proxy.service.ts'],
    testPaths: ['test/httpClient.unit.test.ts'],
  },
  {
    id: 'audit-hash-chain',
    name: 'Tamper-evident audit chain',
    category: 'evidence',
    status: 'implemented',
    provenance: 'live',
    summary:
      'SHA-256 hash-chained audit log with verification endpoint. Locally controlled chains are tamper-evident, not externally anchored.',
    limitations: [
      'Not externally anchored (not immutable against a compromised host).',
      'Do not describe the chain as tamper-proof.',
    ],
    implementationPaths: [
      'src/modules/audit/audit.hash.ts',
      'src/modules/audit/audit.service.ts',
      'src/modules/audit/audit.store.ts',
    ],
    testPaths: ['test/auditHashChain.unit.test.ts'],
  },
  {
    id: 'canonical-security-events',
    name: 'Canonical normalized security events',
    category: 'cloud-ingestion',
    status: 'implemented',
    provenance: 'replay',
    summary:
      'Provider-independent security event schema with redaction, deduplication, retention, and parser-failure capture. Every ingestion path - fixture replay, guided scenarios, and the live AWS/GCP adapters - runs through the single canonical pipeline in src/modules/ingestion/security-ingestion.pipeline.ts.',
    implementationPaths: [
      'src/modules/security/types.ts',
      'src/modules/ingestion/security-event.schema.ts',
      'src/modules/ingestion/security-ingestion.pipeline.ts',
      'src/modules/ingestion/redaction.ts',
      'src/modules/ingestion/security-event.store.ts',
    ],
    testPaths: [
      'test/security-event.unit.test.ts',
      'test/redaction.unit.test.ts',
      'test/parser-failure-redaction.unit.test.ts',
    ],
  },
  {
    id: 'aws-cloudwatch-ingestion',
    name: 'AWS CloudWatch / CloudTrail ingestion',
    category: 'cloud-ingestion',
    status: 'implemented',
    provenance: env.ingestion.cloudwatchLogGroup ? 'live' : 'replay',
    summary:
      'CloudWatchAdapter polls CloudWatch Logs, unwraps each log event into a provider-native CloudTrail/WAF/API Gateway record, and feeds it through the same canonical pipeline as replay (parse -> normalize -> redact -> dedupe -> detect -> correlate) - not a separate legacy path. Runs live once AWS credentials and a log group are configured; sanitized fixtures support deterministic replay without them either way.',
    limitations: [
      'Live polling requires AWS credentials or Roles Anywhere configuration.',
      'Static IAM user keys are legacy/demo-only and disabled by default in Terraform.',
      'Operational metrics (events received/ingested/parser failures/duplicates/cursor) are tracked per-adapter and exposed via GET /admin/ingestion/status.',
    ],
    implementationPaths: [
      'src/modules/ingestion/adapters/cloudwatch.adapter.ts',
      'src/modules/ingestion/parsers/aws.parser.ts',
      'src/modules/ingestion/ingestion.service.ts',
      'src/modules/ingestion/security-ingestion.pipeline.ts',
    ],
    testPaths: [
      'test/cloudwatch-adapter.unit.test.ts',
      'test/cloudwatch-adapter-pipeline.integration.test.ts',
      'test/detection-rules.unit.test.ts',
    ],
    infrastructurePaths: [
      'terraform/modules/aws-logging',
    ],
  },
  {
    id: 'gcp-logging-ingestion',
    name: 'GCP Cloud Logging ingestion',
    category: 'cloud-ingestion',
    status: 'implemented',
    provenance: env.ingestion.gcpLoggingProject ? 'live' : 'replay',
    summary:
      'GcpLoggingAdapter polls Cloud Logging, reshapes each entry into the provider-native Cloud Audit Log record shape, and feeds it through the same canonical pipeline as replay (parse -> normalize -> redact -> dedupe -> detect -> correlate) - not a separate legacy path. Runs live once project credentials are configured; sanitized fixtures support deterministic replay without them either way. Workload Identity Federation is the preferred credential mode.',
    limitations: [
      'Service-account JSON keys are legacy/demo-only and disabled by default.',
      'Live federation requires external IdP trust configuration.',
      'Operational metrics (events received/ingested/parser failures/duplicates/cursor) are tracked per-adapter and exposed via GET /admin/ingestion/status.',
    ],
    implementationPaths: [
      'src/modules/ingestion/adapters/gcp-logging.adapter.ts',
      'src/modules/ingestion/parsers/gcp.parser.ts',
      'src/modules/ingestion/ingestion.service.ts',
      'src/modules/ingestion/security-ingestion.pipeline.ts',
    ],
    testPaths: [
      'test/gcp-logging-adapter.unit.test.ts',
      'test/gcp-logging-adapter-pipeline.integration.test.ts',
      'test/detection-rules.unit.test.ts',
    ],
    infrastructurePaths: [
      'terraform/modules/gcp-logging',
    ],
  },
  {
    id: 'azure-activity-ingestion',
    name: 'Azure activity / Monitor event replay',
    category: 'cloud-ingestion',
    status: 'partial',
    provenance: 'replay',
    summary:
      'Azure Activity Log fixtures are normalized through the real parser pipeline. Live Azure Monitor / Log Analytics polling is not implemented - the deployed adapter (azure-sentinel.adapter.ts) is a placeholder that only reports whether AZURE_SENTINEL_WORKSPACE is set, honestly surfaced as "not configured" rather than connected.',
    limitations: [
      'No live Azure Sentinel or Azure Monitor connector in this repository - replay only.',
      'azure-sentinel.adapter.ts intentionally does not attempt a live SDK connection; do not read its presence as Sentinel being connected.',
    ],
    implementationPaths: [
      'src/modules/ingestion/adapters/azure-sentinel.adapter.ts',
      'src/modules/ingestion/parsers/azure.parser.ts',
    ],
    testPaths: ['test/detection-rules.unit.test.ts'],
    infrastructurePaths: ['terraform/modules/monitoring'],
  },
  {
    id: 'detection-engine',
    name: 'Provider-independent detection rules',
    category: 'detection',
    status: 'implemented',
    provenance: 'live',
    summary:
      'Documented detection rules (GW-AUTH-001, GW-TOKEN-001, AWS-IAM-001/002, GCP-IAM-001, AZ-IAM-001) evaluate normalized events. Wired into both the live gateway-lockout path (auth.controller.ts) and the fixture replay endpoint (security.routes.ts).',
    implementationPaths: [
      'src/modules/detection/engine.ts',
      'src/modules/detection/rules',
    ],
    testPaths: [
      'test/detection-rules.unit.test.ts',
    ],
  },
  {
    id: 'investigations',
    name: 'Correlated security investigations',
    category: 'detection',
    status: 'implemented',
    provenance: 'live',
    summary:
      'Detections are correlated into investigations by principal, resource, source IP, account, and time window with transparent grouping explanations, dedup, and reopen-on-resolved-investigation logic.',
    implementationPaths: [
      'src/modules/investigations/investigation.service.ts',
      'src/modules/investigations/correlation.ts',
    ],
    testPaths: [
      'test/investigations.unit.test.ts',
    ],
  },
  {
    id: 'response-block-ip',
    name: 'Response action: block IP',
    category: 'response',
    status: 'implemented',
    provenance: 'live',
    summary: 'Enforced IP block via threat service and gateway middleware, with audited unblock.',
    implementationPaths: ['src/modules/response/response.service.ts'],
    testPaths: ['test/ip-block.integration.test.ts'],
  },
  {
    id: 'response-revoke-sessions',
    name: 'Response action: revoke sessions',
    category: 'response',
    status: 'implemented',
    provenance: 'live',
    summary: 'Enforced revocation of demo-target token families with audit trail.',
    implementationPaths: ['src/modules/response/response.service.ts'],
    testPaths: ['test/session-revoke.integration.test.ts'],
  },
  {
    id: 'response-open-ticket',
    name: 'Response action: open external ticket',
    category: 'response',
    status: 'simulated',
    provenance: 'synthetic',
    summary: 'Ticket creation is explicitly simulated. No external ITSM integration is configured.',
    limitations: ['No real ticket system is connected.'],
    implementationPaths: ['src/modules/response/response.service.ts'],
    testPaths: [],
  },
  {
    id: 'response-disable-cloud-identity',
    name: 'Response action: disable cloud identity',
    category: 'response',
    status: 'planned',
    provenance: 'planned',
    summary:
      'Disable AWS/GCP/Entra identity actions are disabled pending a safe sandbox integration.',
    limitations: ['Never labelled enforced or completed.'],
    implementationPaths: ['src/modules/response/response.service.ts'],
    testPaths: [],
  },
  {
    id: 'guided-scenarios',
    name: 'Deterministic guided scenarios',
    category: 'detection',
    status: 'implemented',
    provenance: 'live',
    summary:
      'Three scripted 6-step scenarios (Generate/Replay -> Normalize -> Detect -> Correlate -> Respond -> Verify): gateway credential attack (live - real failed logins against the dedicated sim-target account from an RFC 5737 IP, ending in an enforced IP block), AWS privileged activity (replay), GCP credential persistence (replay). No scenario performs a destructive cloud action or touches the caller\'s own account/IP.',
    limitations: [
      'No dedicated stepper UI yet - the API returns the full step trace, but the dashboard does not yet render it visually.',
    ],
    implementationPaths: [
      'src/modules/scenarios/scenario.service.ts',
      'src/modules/scenarios/scenario.routes.ts',
      'src/modules/security/gateway-detection.ts',
      'src/modules/ingestion/replay.ts',
    ],
    testPaths: ['test/scenarios.integration.test.ts'],
  },
  {
    id: 'reviewer-demo-mode',
    name: 'One-click read-only reviewer demo',
    category: 'platform-security',
    status: 'implemented',
    provenance: 'live',
    summary:
      'POST /auth/demo-login authenticates as a fixed, read-only "reviewer" role account with no write:admin/manage:users permissions. The reviewer role can run the 3 allowlisted guided scenarios and read capabilities/events/investigations/metrics, but is rejected (403) from blocking arbitrary IPs, revoking arbitrary sessions, and all other mutating admin routes.',
    limitations: [
      'RBAC-enforced allowlist, verified by test - not yet a dedicated "read-only mode" UI banner/indicator in the dashboard.',
    ],
    implementationPaths: [
      'src/modules/auth/auth.service.ts',
      'src/modules/auth/auth.controller.ts',
      'src/modules/scenarios/scenario.routes.ts',
    ],
    testPaths: ['test/scenarios.integration.test.ts'],
  },
  {
    id: 'evidence-export',
    name: 'Investigation evidence export',
    category: 'evidence',
    status: 'implemented',
    provenance: 'live',
    summary:
      'GET /admin/security/investigations/:id/evidence-export returns a redacted JSON bundle (investigation, normalized events, detections, response actions, audit-chain verification, README). Events are already redacted at ingestion time.',
    limitations: [
      'Returned as a single JSON object keyed by filename, not a literal .zip archive - no archive library is used.',
      'Audit-chain verification is tamper-evident, not tamper-proof (see audit-hash-chain).',
    ],
    implementationPaths: ['src/modules/investigations/evidence-export.ts'],
    testPaths: ['test/evidence-export.unit.test.ts'],
  },
  {
    id: 'control-evidence-mapping',
    name: 'Control evidence framework mapping',
    category: 'evidence',
    status: 'partial',
    provenance: 'live',
    summary:
      'Maps implemented controls to framework references for reviewer evidence. Not a certification claim.',
    limitations: [
      'Percentages, if shown, are transparent coverage of explicitly listed controls only.',
      'Does not imply PCI, GDPR, NIST, or OWASP certification.',
    ],
    implementationPaths: [
      'src/modules/admin/compliance.service.ts',
      'dashboard/src/data/complianceEvidence.ts',
    ],
    testPaths: [],
  },
  {
    id: 'azure-workload-identity',
    name: 'Azure managed identity + OIDC CI/CD',
    category: 'platform-security',
    status: 'implemented',
    provenance: 'live',
    summary:
      'Container Apps use user-assigned managed identity. GitHub deploy uses OIDC federated credentials.',
    implementationPaths: [
      'terraform/modules/container-app',
      '.github/workflows/deploy.yml',
    ],
    testPaths: [],
    infrastructurePaths: ['terraform/modules/container-app'],
  },
  {
    id: 'gcp-workload-identity-federation',
    name: 'GCP Workload Identity Federation',
    category: 'platform-security',
    status: 'planned',
    provenance: 'planned',
    summary:
      'Not built. terraform/modules/gcp-logging currently provisions a static service-account JSON key (see gcp-logging-ingestion limitations). No terraform/modules/gcp-workload-identity module exists yet.',
    limitations: [
      'Requires external IdP (e.g. Entra) configuration to be fully live.',
      'Do not claim this is deployed anywhere until the module exists and federated token exchange is confirmed in a target environment.',
    ],
    implementationPaths: [],
    testPaths: [],
    infrastructurePaths: [],
  },
  {
    id: 'aws-roles-anywhere',
    name: 'AWS IAM Roles Anywhere / short-lived credentials',
    category: 'platform-security',
    status: 'planned',
    provenance: 'planned',
    summary:
      'Not built. terraform/modules/aws-logging currently provisions a static IAM user + access key (see aws-cloudwatch-ingestion limitations). No terraform/modules/aws-roles-anywhere module exists yet.',
    limitations: [
      'Requires a trust anchor / certificate or OIDC setup outside this repository to be fully live.',
      'Do not claim this is deployed anywhere until the module exists and role assumption is confirmed in a target environment.',
    ],
    implementationPaths: [],
    testPaths: [],
    infrastructurePaths: [],
  },
];

export function getCapabilities(): CapabilityDefinition[] {
  return CAPABILITY_REGISTRY.map((c) => ({ ...c }));
}

export function getCapabilitiesByStatus(status: CapabilityDefinition['status']): CapabilityDefinition[] {
  return CAPABILITY_REGISTRY.filter((c) => c.status === status).map((c) => ({ ...c }));
}

export function getCapability(id: string): CapabilityDefinition | undefined {
  const found = CAPABILITY_REGISTRY.find((c) => c.id === id);
  return found ? { ...found } : undefined;
}

export function getCapabilitySummary() {
  const byStatus = {
    implemented: getCapabilitiesByStatus('implemented'),
    partial: getCapabilitiesByStatus('partial'),
    simulated: getCapabilitiesByStatus('simulated'),
    planned: getCapabilitiesByStatus('planned'),
  };

  return {
    total: CAPABILITY_REGISTRY.length,
    counts: {
      implemented: byStatus.implemented.length,
      partial: byStatus.partial.length,
      simulated: byStatus.simulated.length,
      planned: byStatus.planned.length,
    },
    capabilities: getCapabilities(),
    jwtAlgorithm: env.auth.jwt.algorithm,
    demoMode: env.features.demoMode,
    cloudSources: {
      aws: {
        mode: env.ingestion.cloudwatchLogGroup ? 'live_or_configured' : 'replay_ready',
        logGroupConfigured: Boolean(env.ingestion.cloudwatchLogGroup),
      },
      gcp: {
        mode: env.ingestion.gcpLoggingProject ? 'live_or_configured' : 'replay_ready',
        projectConfigured: Boolean(env.ingestion.gcpLoggingProject),
      },
      azure: {
        mode: 'replay_ready',
        sentinelConnected: false,
        note: 'Azure Sentinel is not implemented. Activity Log replay and Azure Monitor platform logging are available.',
      },
    },
  };
}
