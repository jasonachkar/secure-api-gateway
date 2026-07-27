/**
 * Gateway-native security event helper
 */

import { createNormalizedSecurityEvent } from '../security-event.schema.js';
import type { DataProvenance, NormalizedSecurityEvent, SecurityEventCategory, SecuritySeverity } from '../../security/types.js';

export function parseGatewayEvent(
  raw: unknown,
  provenance: DataProvenance = 'live'
): NormalizedSecurityEvent {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('Gateway event payload must be an object');
  }
  const event = raw as Record<string, unknown>;
  const action = typeof event.action === 'string' ? event.action : 'gateway.event';
  const providerEventId =
    typeof event.providerEventId === 'string'
      ? event.providerEventId
      : typeof event.id === 'string'
        ? event.id
        : `${action}-${Date.now()}`;

  return createNormalizedSecurityEvent({
    providerEventId,
    provider: 'gateway',
    sourceService: typeof event.sourceService === 'string' ? event.sourceService : 'secure-api-gateway',
    occurredAt:
      typeof event.occurredAt === 'string' || typeof event.occurredAt === 'number'
        ? (event.occurredAt as string | number)
        : Date.now(),
    action,
    outcome:
      event.outcome === 'success' || event.outcome === 'failure' || event.outcome === 'unknown'
        ? event.outcome
        : 'unknown',
    sourceIp: typeof event.sourceIp === 'string' ? event.sourceIp : undefined,
    userAgent: typeof event.userAgent === 'string' ? event.userAgent : undefined,
    severity: (event.severity as SecuritySeverity) || 'medium',
    category: (event.category as SecurityEventCategory) || 'other',
    title: typeof event.title === 'string' ? event.title : action,
    summary: typeof event.summary === 'string' ? event.summary : action,
    provenance,
    correlationId: typeof event.correlationId === 'string' ? event.correlationId : undefined,
    principal:
      typeof event.principal === 'object' && event.principal !== null
        ? (event.principal as NormalizedSecurityEvent['principal'])
        : undefined,
    accountOrProjectId:
      typeof event.accountOrProjectId === 'string' ? event.accountOrProjectId : undefined,
    rawEvent: event,
    evidence: [
      {
        type: 'source-code',
        label: 'Gateway parser',
        reference: 'src/modules/ingestion/parsers/gateway.parser.ts',
      },
    ],
  });
}
