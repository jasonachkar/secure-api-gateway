/**
 * GCP Cloud Audit Log parser → NormalizedSecurityEvent
 */

import { createNormalizedSecurityEvent } from '../security-event.schema.js';
import type { DataProvenance, NormalizedSecurityEvent, SecuritySeverity } from '../../security/types.js';

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  throw new Error('GCP event payload must be an object');
}

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

export function parseGcpEvent(
  raw: unknown,
  provenance: DataProvenance = 'replay'
): NormalizedSecurityEvent {
  const event = asRecord(raw);
  const proto = asRecord(event.protoPayload ?? event);
  const authInfo = asRecord(proto.authenticationInfo ?? {});
  const requestMetadata = asRecord(proto.requestMetadata ?? {});
  const resource = asRecord(event.resource ?? proto.resource ?? {});
  const labels = asRecord(resource.labels ?? {});
  const status = asRecord(proto.status ?? event.status ?? {});

  const insertId = str(event.insertId || event.insert_id || proto.requestId || event.logName);
  if (!insertId) {
    throw new Error('GCP event missing insertId / provider event ID');
  }

  const methodName = str(proto.methodName || event.methodName);
  const principalEmail = str(authInfo.principalEmail || authInfo.principalSubject);
  const projectId = str(labels.project_id || event.projectId || nestedProject(event));
  const severityRaw = str(event.severity || 'NOTICE').toUpperCase();
  const statusCode = typeof status.code === 'number' ? status.code : Number(status.code ?? 0);
  const outcome = statusCode && statusCode !== 0 ? 'failure' : 'success';

  let severity: SecuritySeverity = mapGcpSeverity(severityRaw);
  let category: NormalizedSecurityEvent['category'] = 'other';
  let title = methodName || 'GCP audit event';
  let summary = methodName;

  if (
    methodName.includes('serviceAccountKeys.create') ||
    methodName.includes('CreateServiceAccountKey')
  ) {
    severity = 'high';
    category = 'persistence';
    title = 'GCP service-account key created';
    summary = 'Long-lived service account key created; prefer workload identity federation';
  } else if (
    methodName.includes('SetIamPolicy') ||
    methodName.includes('setIamPolicy')
  ) {
    severity = 'high';
    category = 'privilege-escalation';
    title = 'GCP IAM policy modified';
    summary = 'IAM policy change detected';
  } else if (
    methodName.includes('roles/owner') ||
    methodName.includes('roles/editor') ||
    str(JSON.stringify(proto.serviceData ?? proto.request ?? {})).includes('roles/owner')
  ) {
    severity = 'critical';
    category = 'privilege-escalation';
    title = 'GCP privileged role granted';
    summary = 'Privileged GCP role assignment detected';
  } else if (statusCode === 7 || statusCode === 16 || methodName.toLowerCase().includes('denied')) {
    severity = 'medium';
    category = 'authorization';
    title = 'GCP permission denied';
    summary = 'Authentication or authorization failure';
  } else if (
    methodName.includes('UpdateSink') ||
    methodName.includes('SetIamPolicy') && methodName.includes('logging')
  ) {
    severity = 'high';
    category = 'audit-integrity';
    title = 'GCP audit configuration change';
    summary = 'Logging / audit configuration modified';
  } else if (methodName.includes('cloudarmor') || methodName.includes('securityPolicies')) {
    severity = 'medium';
    category = 'malicious-request';
    title = 'Cloud Armor blocked or policy event';
    summary = 'Cloud Armor security policy event';
  }

  const occurredAt = str(event.timestamp || event.receiveTimestamp || new Date().toISOString());

  return createNormalizedSecurityEvent({
    providerEventId: insertId,
    provider: 'gcp',
    sourceService: str(proto.serviceName || event.logName || 'cloudaudit.googleapis.com'),
    occurredAt,
    accountOrProjectId: projectId || undefined,
    region: str(labels.location || event.region) || undefined,
    principal: {
      id: principalEmail || undefined,
      type: principalEmail.includes('.gserviceaccount.com') ? 'serviceAccount' : 'user',
      email: principalEmail || undefined,
      displayName: principalEmail || undefined,
    },
    resource: {
      id: str(resource.name || proto.resourceName),
      type: str(resource.type),
      name: str(proto.resourceName || resource.name),
      accountOrProjectId: projectId || undefined,
    },
    action: methodName || 'unknown',
    outcome,
    sourceIp: str(requestMetadata.callerIp) || undefined,
    userAgent: str(requestMetadata.callerSuppliedUserAgent) || undefined,
    severity,
    category,
    title,
    summary,
    provenance,
    evidence: [
      {
        type: 'source-code',
        label: 'GCP parser',
        reference: 'src/modules/ingestion/parsers/gcp.parser.ts',
      },
      {
        type: 'test',
        label: 'GCP parser tests',
        reference: 'test/gcp-parser.unit.test.ts',
      },
    ],
    rawEvent: event,
  });
}

function mapGcpSeverity(value: string): SecuritySeverity {
  if (value === 'CRITICAL' || value === 'ALERT' || value === 'EMERGENCY') return 'critical';
  if (value === 'ERROR') return 'high';
  if (value === 'WARNING') return 'medium';
  if (value === 'NOTICE' || value === 'INFO') return 'low';
  return 'informational';
}

function nestedProject(event: Record<string, unknown>): string {
  const logName = str(event.logName);
  const match = logName.match(/projects\/([^/]+)\//);
  return match?.[1] ?? '';
}
