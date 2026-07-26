/**
 * InvestigationService.correlate() concurrency: multiple detections sharing a
 * correlation key (same rule, principal, account, and time bucket) racing to correlate
 * simultaneously must converge on exactly one investigation, never create duplicates or
 * lose a detection. Uses a real Redis connection, consistent with the rest of this
 * repo's store tests.
 */
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import Redis from 'ioredis';
import { InvestigationService } from '../src/modules/investigations/investigation.service.js';
import { createNormalizedSecurityEvent } from '../src/modules/ingestion/security-event.schema.js';
import { awsIam001 } from '../src/modules/detection/rules/index.js';
import type { DetectionResult } from '../src/modules/security/types.js';

function rootEvent(providerEventId: string) {
  return createNormalizedSecurityEvent({
    providerEventId,
    provider: 'aws',
    sourceService: 'signin.amazonaws.com',
    occurredAt: '2026-01-01T00:00:00.000Z',
    action: 'ConsoleLogin',
    outcome: 'success',
    severity: 'critical',
    category: 'privilege-escalation',
    title: 'AWS root-account activity',
    summary: 'Root account activity detected',
    provenance: 'live',
    accountOrProjectId: '123456789012',
    sourceIp: '192.0.2.10',
    principal: { id: 'arn:aws:iam::123456789012:root', type: 'Root', displayName: 'root' },
    rawEvent: {},
  });
}

function detect(event: ReturnType<typeof rootEvent>): DetectionResult {
  const result = awsIam001.evaluate(event, {});
  if (!result) throw new Error('expected AWS-IAM-001 to match');
  return result;
}

describe('InvestigationService.correlate - concurrency', () => {
  let redis: Redis;
  let service: InvestigationService;

  beforeEach(() => {
    redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      db: parseInt(process.env.REDIS_DB || '0', 10),
    });
    service = new InvestigationService(redis);
  });

  afterEach(async () => {
    await redis.flushdb();
    await redis.quit();
  });

  it('converges 15 concurrent detections sharing a correlation key into exactly one investigation', async () => {
    const pairs = Array.from({ length: 15 }, (_, i) => {
      const event = rootEvent(`evt-root-${i}`);
      return { event, detection: detect(event) };
    });
    // Distinct events and distinct detections, but the same correlation key (same rule,
    // principal, account, and 15-minute time bucket).
    expect(new Set(pairs.map((p) => p.detection.id)).size).toBe(15);

    const investigations = await Promise.all(pairs.map(({ event, detection }) => service.correlate(event, detection)));

    const uniqueIds = new Set(investigations.map((inv) => inv.id));
    expect(uniqueIds.size).toBe(1);

    const [finalInvestigation] = investigations;
    const winner = await service.getInvestigation(finalInvestigation.id);
    expect(winner).not.toBeNull();
    // Every detection and every event made it into the final record - none lost to a
    // race between the claim and the merge.
    expect(new Set(winner!.detectionIds).size).toBe(15);
    expect(new Set(winner!.eventIds).size).toBe(15);

    const listed = await service.listInvestigations({});
    expect(listed.filter((inv) => inv.correlationKey === winner!.correlationKey)).toHaveLength(1);
  });

  it('is idempotent: correlating the exact same detection twice does not double-append to the timeline', async () => {
    const event = rootEvent('evt-root-idempotent');
    const detection = detect(event);

    const first = await service.correlate(event, detection);
    const second = await service.correlate(event, detection);

    expect(second.id).toBe(first.id);
    expect(second.detectionIds).toEqual(first.detectionIds);
    expect(second.timeline.length).toBe(first.timeline.length);
  });

  it('does not create duplicate investigations for detections with genuinely different correlation keys', async () => {
    const eventA = rootEvent('evt-a');
    const eventB = createNormalizedSecurityEvent({
      providerEventId: 'evt-b',
      provider: 'aws',
      sourceService: 'signin.amazonaws.com',
      occurredAt: '2026-01-01T00:00:00.000Z',
      action: 'ConsoleLogin',
      outcome: 'success',
      severity: 'critical',
      category: 'privilege-escalation',
      title: 'AWS root-account activity',
      summary: 'Root account activity detected',
      provenance: 'live',
      accountOrProjectId: '999999999999', // different account -> different correlation key
      sourceIp: '203.0.113.5',
      principal: { id: 'arn:aws:iam::999999999999:root', type: 'Root', displayName: 'root' },
      rawEvent: {},
    });

    const [invA, invB] = await Promise.all([
      service.correlate(eventA, detect(eventA)),
      service.correlate(eventB, detect(eventB)),
    ]);

    expect(invA.id).not.toBe(invB.id);
    const listed = await service.listInvestigations({});
    expect(listed).toHaveLength(2);
  });
});
