/**
 * Azure Activity Log / Monitor event parser → NormalizedSecurityEvent
 * Used for replay fixtures; does not imply Azure Sentinel connectivity.
 */

import { createNormalizedSecurityEvent } from '../security-event.schema.js';
import type { DataProvenance, NormalizedSecurityEvent, SecuritySeverity } from '../../security/types.js';

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  throw new Error('Azure event payload must be an object');
}

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

export function parseAzureEvent(
  raw: unknown,
  provenance: DataProvenance = 'replay'
): NormalizedSecurityEvent {
  const event = asRecord(raw);
  const props = asRecord(event.properties ?? event.data ?? {});
  const caller = str(
    event.caller ||
      nestedStr(props, ['initiatedBy', 'user', 'userPrincipalName']) ||
      nestedStr(props, ['initiatedBy', 'app', 'displayName'])
  );

  const eventId = str(event.eventDataId || event.id || event.operationId || props.eventId);
  if (!eventId) {
    throw new Error('Azure event missing provider event ID');
  }

  const operation = str(event.operationName || props.operationName || event.name);
  const status = str(event.status || props.status || props.resultType || 'Succeeded');
  const outcome =
    /fail|denied|error/i.test(status) || str(props.resultSignature).toLowerCase() === 'failed'
      ? 'failure'
      : 'success';

  let severity: SecuritySeverity = 'low';
  let category: NormalizedSecurityEvent['category'] = 'other';
  let title = operation || 'Azure activity event';
  let summary = operation;

  if (/roleAssignments\/write|Microsoft\.Authorization\/roleAssignments/i.test(operation)) {
    severity = 'critical';
    category = 'privilege-escalation';
    title = 'Azure privileged role assignment';
    summary = 'Privileged Azure RBAC role assignment detected';
  } else if (/KeyVault|vaults\/.*accessPolicies|roleAssignments.*[Kk]ey[Vv]ault/i.test(operation)) {
    severity = 'high';
    category = 'configuration-change';
    title = 'Azure Key Vault access policy or RBAC change';
    summary = 'Key Vault authorization configuration changed';
  } else if (/networkSecurityGroups|securityRules/i.test(operation)) {
    severity = 'high';
    category = 'network';
    title = 'Azure NSG configuration change';
    summary = 'Network security group rule change detected';
  } else if (/AuthorizationFailed|Forbidden|deny/i.test(operation + status + str(props.statusMessage))) {
    severity = 'medium';
    category = 'authorization';
    title = 'Azure authorization failure';
    summary = 'Caller failed Azure authorization check';
  } else if (/app\/containerApps|Microsoft\.App\/containerApps/i.test(operation)) {
    severity = 'medium';
    category = 'configuration-change';
    title = 'Azure Container App configuration change';
    summary = 'Container Apps configuration was modified';
  }

  const occurredAt = str(
    event.eventTimestamp || event.time || event.submissionTimestamp || new Date().toISOString()
  );

  return createNormalizedSecurityEvent({
    providerEventId: eventId,
    provider: 'azure',
    sourceService: str(event.category || event.resourceProviderName || 'Microsoft.Insights/ActivityLogs'),
    occurredAt,
    accountOrProjectId: str(event.subscriptionId || props.subscriptionId) || undefined,
    region: str(event.resourceLocation || event.location) || undefined,
    principal: {
      id: caller || undefined,
      type: caller.includes('@') ? 'user' : 'identity',
      email: caller.includes('@') ? caller : undefined,
      displayName: caller || undefined,
    },
    resource: {
      id: str(event.resourceId || props.resourceId),
      type: str(event.resourceType),
      name: str(event.resourceId || props.resourceId).split('/').pop(),
      accountOrProjectId: str(event.subscriptionId) || undefined,
      region: str(event.resourceLocation) || undefined,
    },
    action: operation || 'unknown',
    outcome,
    sourceIp: str(props.ipAddress || event.callerIpAddress) || undefined,
    userAgent: str(props.userAgent) || undefined,
    severity,
    category,
    title,
    summary,
    provenance,
    evidence: [
      {
        type: 'source-code',
        label: 'Azure parser',
        reference: 'src/modules/ingestion/parsers/azure.parser.ts',
      },
      {
        type: 'test',
        label: 'Azure parser tests',
        reference: 'test/azure-parser.unit.test.ts',
      },
    ],
    rawEvent: event,
  });
}

function nestedStr(obj: Record<string, unknown>, path: string[]): string {
  let current: unknown = obj;
  for (const key of path) {
    if (typeof current !== 'object' || current === null) return '';
    current = (current as Record<string, unknown>)[key];
  }
  return typeof current === 'string' ? current : '';
}
