/**
 * InvestigationService: correlation into new vs. existing investigations,
 * reopening resolved investigations, and response-action attachment.
 * Uses a real local Redis (see test/apiKey.unit.test.ts for the same convention).
 */
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import Redis from 'ioredis';
import { InvestigationService } from '../src/modules/investigations/investigation.service.js';
import { createNormalizedSecurityEvent } from '../src/modules/ingestion/security-event.schema.js';
import { awsIam001 } from '../src/modules/detection/rules/index.js';
import type { DetectionResult, ResponseActionRecord } from '../src/modules/security/types.js';

function rootEvent(overrides: Partial<Parameters<typeof createNormalizedSecurityEvent>[0]> = {}) {
  return createNormalizedSecurityEvent({
    providerEventId: 'evt-root-1',
    provider: 'aws',
    sourceService: 'signin.amazonaws.com',
    occurredAt: '2026-01-01T00:00:00.000Z',
    action: 'ConsoleLogin',
    outcome: 'success',
    severity: 'critical',
    category: 'privilege-escalation',
    title: 'AWS root-account activity',
    summary: 'Root account activity detected',
    provenance: 'replay',
    accountOrProjectId: '123456789012',
    sourceIp: '192.0.2.10',
    principal: { id: 'arn:aws:iam::123456789012:root', type: 'Root', displayName: 'root' },
    rawEvent: {},
    ...overrides,
  });
}

function detect(event: ReturnType<typeof rootEvent>): DetectionResult {
  const result = awsIam001.evaluate(event, {});
  if (!result) throw new Error('expected AWS-IAM-001 to match');
  return result;
}

describe('InvestigationService', () => {
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

  it('opens a new investigation on the first matching detection', async () => {
    const event = rootEvent();
    const investigation = await service.correlate(event, detect(event));

    expect(investigation.status).toBe('open');
    expect(investigation.eventIds).toEqual([event.id]);
    expect(investigation.detectionIds).toHaveLength(1);
    expect(investigation.correlationExplanation).toContain('same detection rule (AWS-IAM-001)');
    expect(investigation.timeline.length).toBeGreaterThanOrEqual(3);
  });

  it('correlates a second matching event within the same window into the same investigation', async () => {
    const first = rootEvent({ providerEventId: 'evt-root-1' });
    const opened = await service.correlate(first, detect(first));

    const second = rootEvent({
      providerEventId: 'evt-root-2',
      occurredAt: '2026-01-01T00:05:00.000Z',
    });
    const updated = await service.correlate(second, detect(second));

    expect(updated.id).toBe(opened.id);
    expect(updated.eventIds).toEqual(expect.arrayContaining([first.id, second.id]));
    expect(updated.detectionIds).toHaveLength(2);
  });

  it('opens a distinct investigation once the correlation window has passed', async () => {
    const first = rootEvent({ providerEventId: 'evt-root-1', occurredAt: '2026-01-01T00:00:00.000Z' });
    const opened = await service.correlate(first, detect(first));

    const later = rootEvent({ providerEventId: 'evt-root-3', occurredAt: '2026-01-01T01:00:00.000Z' });
    const second = await service.correlate(later, detect(later));

    expect(second.id).not.toBe(opened.id);
  });

  it('reopens a resolved investigation when a new matching detection arrives', async () => {
    const first = rootEvent({ providerEventId: 'evt-root-1' });
    const opened = await service.correlate(first, detect(first));
    await service.setStatus(opened.id, 'resolved', 'analyst-1');

    const second = rootEvent({ providerEventId: 'evt-root-2', occurredAt: '2026-01-01T00:02:00.000Z' });
    const reopened = await service.correlate(second, detect(second));

    expect(reopened.id).toBe(opened.id);
    expect(reopened.status).toBe('investigating');
    expect(reopened.timeline.some((t) => t.type === 'status_change')).toBe(true);
  });

  it('attaches a response action to an investigation and records it on the timeline', async () => {
    const event = rootEvent();
    const investigation = await service.correlate(event, detect(event));

    const action: ResponseActionRecord = {
      id: 'action-1',
      action: 'block_ip',
      mode: 'enforced',
      target: '192.0.2.10',
      actor: 'admin',
      reason: 'root account activity from suspicious IP',
      result: 'success',
      timestamp: new Date().toISOString(),
    };
    const updated = await service.attachResponseAction(investigation.id, action);

    expect(updated?.responseActions).toHaveLength(1);
    expect(updated?.timeline.some((t) => t.type === 'enforcement_result')).toBe(true);
  });

  it('lists investigations filtered by status', async () => {
    const event = rootEvent();
    const investigation = await service.correlate(event, detect(event));
    await service.setStatus(investigation.id, 'contained', 'admin');

    const open = await service.listInvestigations({ status: 'open' });
    const contained = await service.listInvestigations({ status: 'contained' });

    expect(open.find((i) => i.id === investigation.id)).toBeUndefined();
    expect(contained.find((i) => i.id === investigation.id)).toBeDefined();
  });
});
