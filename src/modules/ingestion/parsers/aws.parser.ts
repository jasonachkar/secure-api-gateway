/**
 * AWS CloudTrail / WAF / API Gateway event parser → NormalizedSecurityEvent
 */

import { createNormalizedSecurityEvent } from '../security-event.schema.js';
import type { DataProvenance, NormalizedSecurityEvent, SecuritySeverity } from '../../security/types.js';

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  throw new Error('AWS event payload must be an object');
}

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function nested(obj: Record<string, unknown>, path: string[]): unknown {
  let current: unknown = obj;
  for (const key of path) {
    if (typeof current !== 'object' || current === null) return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

export function parseAwsEvent(
  raw: unknown,
  provenance: DataProvenance = 'replay'
): NormalizedSecurityEvent {
  const event = asRecord(raw);
  const eventName = str(event.eventName || event.action || nested(event, ['httpRequest', 'action']));
  const eventSource = str(event.eventSource || event.sourceService || 'aws');
  const eventId = str(event.eventID || event.eventId || nested(event, ['httpRequest', 'requestId']) || event.id);
  if (!eventId) {
    throw new Error('AWS event missing provider event ID');
  }

  const userIdentity = asRecord(event.userIdentity ?? {});
  const principalType = str(userIdentity.type, 'unknown');
  const principalId = str(userIdentity.arn || userIdentity.principalId || userIdentity.userName);
  const isRoot = principalType === 'Root' || /:root$/.test(principalId) || str(userIdentity.userName) === 'root';

  const errorCode = str(event.errorCode);
  const outcome =
    errorCode || str(event.errorMessage)
      ? 'failure'
      : eventName.toLowerCase().includes('denied') || str(nested(event, ['action'])) === 'BLOCK'
        ? 'failure'
        : 'success';

  let severity: SecuritySeverity = 'low';
  let category: NormalizedSecurityEvent['category'] = 'other';
  let title = eventName || 'AWS security event';
  let summary = `${eventSource} ${eventName}`.trim();

  if (isRoot || eventName === 'ConsoleLogin' && isRoot) {
    severity = 'critical';
    category = 'privilege-escalation';
    title = 'AWS root-account activity';
    summary = 'Root account activity detected in CloudTrail';
  } else if (
    ['AttachUserPolicy', 'AttachRolePolicy', 'PutUserPolicy', 'PutRolePolicy', 'CreatePolicyVersion'].includes(
      eventName
    )
  ) {
    severity = 'high';
    category = 'privilege-escalation';
    title = 'AWS IAM policy privilege change';
    summary = `IAM privilege change: ${eventName}`;
  } else if (eventName === 'CreateAccessKey') {
    severity = 'high';
    category = 'persistence';
    title = 'AWS IAM access key created';
    summary = 'Long-lived IAM access key created';
  } else if (eventName === 'ConsoleLogin' && outcome === 'failure') {
    severity = 'medium';
    category = 'authentication';
    title = 'AWS console login failure';
    summary = 'Failed AWS Management Console login';
  } else if (eventSource.includes('waf') || str(nested(event, ['action'])) === 'BLOCK') {
    severity = 'medium';
    category = 'malicious-request';
    title = 'AWS WAF blocked request';
    summary = 'Web request blocked by AWS WAF';
  } else if (
    eventName.includes('Unauthorized') ||
    errorCode === 'AccessDeniedException' ||
    str(event.apiGatewayError) === 'Unauthorized'
  ) {
    severity = 'medium';
    category = 'authorization';
    title = 'AWS API Gateway authorization failure';
    summary = 'Caller failed API Gateway authorization';
  }

  const sourceIp = str(
    event.sourceIPAddress || nested(event, ['httpRequest', 'clientIp']) || nested(event, ['requestContext', 'identity', 'sourceIp'])
  );
  const userAgent = str(
    event.userAgent || nested(event, ['httpRequest', 'headers', 'userAgent']) || nested(event, ['requestContext', 'identity', 'userAgent'])
  );
  const accountId = str(event.recipientAccountId || event.accountId || nested(event, ['userIdentity', 'accountId']));
  const region = str(event.awsRegion || event.region);
  const resources = Array.isArray(event.resources) ? event.resources : [];
  const firstResource = resources[0] && typeof resources[0] === 'object' ? asRecord(resources[0]) : {};
  const requestParams = asRecord(event.requestParameters ?? {});

  const occurredAt = str(event.eventTime || event.timestamp || new Date().toISOString());

  return createNormalizedSecurityEvent({
    providerEventId: eventId,
    provider: 'aws',
    sourceService: eventSource || 'cloudtrail.amazonaws.com',
    occurredAt,
    accountOrProjectId: accountId || undefined,
    region: region || undefined,
    principal: {
      id: principalId || undefined,
      type: principalType,
      displayName: str(userIdentity.userName || userIdentity.principalId) || undefined,
      email: str(userIdentity.principalId).includes('@') ? str(userIdentity.principalId) : undefined,
    },
    resource: {
      id: str(firstResource.ARN || requestParams.userName || requestParams.roleName || nested(event, ['httpRequest', 'uri'])),
      type: str(firstResource.type || requestParams.policyArn ? 'IAM' : eventSource),
      name: str(requestParams.userName || requestParams.roleName || firstResource.ARN),
      accountOrProjectId: accountId || undefined,
      region: region || undefined,
    },
    action: eventName || 'unknown',
    outcome,
    sourceIp: sourceIp || undefined,
    userAgent: userAgent || undefined,
    severity,
    category,
    title,
    summary,
    provenance,
    evidence: [
      {
        type: 'source-code',
        label: 'AWS parser',
        reference: 'src/modules/ingestion/parsers/aws.parser.ts',
      },
      {
        type: 'test',
        label: 'AWS parser tests',
        reference: 'test/aws-parser.unit.test.ts',
      },
    ],
    rawEvent: event,
  });
}
