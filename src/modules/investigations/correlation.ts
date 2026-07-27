import { createHash } from 'node:crypto';
import type { DetectionResult, NormalizedSecurityEvent } from '../security/types.js';

const WINDOW_MS = 15 * 60 * 1000;

export interface CorrelationFactors {
  ruleId?: string;
  principal?: string;
  resource?: string;
  sourceIp?: string;
  accountOrProjectId?: string;
  timeBucket: string;
}

export function timeBucket(isoTimestamp: string, windowMs = WINDOW_MS): string {
  const t = new Date(isoTimestamp).getTime();
  const bucket = Math.floor(t / windowMs) * windowMs;
  return new Date(bucket).toISOString();
}

export function extractCorrelationFactors(
  event: NormalizedSecurityEvent,
  detection: DetectionResult
): CorrelationFactors {
  return {
    ruleId: detection.ruleId,
    principal: event.principal?.id || event.principal?.email || event.principal?.displayName,
    resource: event.resource?.id || event.resource?.name,
    sourceIp: event.sourceIp,
    accountOrProjectId: event.accountOrProjectId,
    timeBucket: timeBucket(event.occurredAt),
  };
}

export function buildCorrelationKey(
  event: NormalizedSecurityEvent,
  detection: DetectionResult
): string {
  if (detection.correlationKey) {
    const bucket = timeBucket(event.occurredAt);
    const material = `${detection.correlationKey}|${bucket}`;
    return createHash('sha256').update(material).digest('hex').slice(0, 32);
  }

  const factors = extractCorrelationFactors(event, detection);
  const material = [
    factors.ruleId ?? '',
    factors.principal ?? '',
    factors.resource ?? '',
    factors.sourceIp ?? '',
    factors.accountOrProjectId ?? '',
    factors.timeBucket,
  ].join('|');

  return createHash('sha256').update(material).digest('hex').slice(0, 32);
}

export function explainCorrelation(factors: CorrelationFactors): string {
  const parts: string[] = [];
  if (factors.ruleId) parts.push(`same detection rule (${factors.ruleId})`);
  if (factors.principal) parts.push(`same principal (${factors.principal})`);
  if (factors.resource) parts.push(`same resource (${factors.resource})`);
  if (factors.sourceIp) parts.push(`same source IP (${factors.sourceIp})`);
  if (factors.accountOrProjectId) {
    parts.push(`same account/project (${factors.accountOrProjectId})`);
  }
  parts.push(`within a 15-minute window starting ${factors.timeBucket}`);

  if (parts.length === 1) {
    return `Events grouped by ${parts[0]}.`;
  }
  return `Events grouped because they share ${parts.slice(0, -1).join(', ')}, ${parts[parts.length - 1]}.`;
}
