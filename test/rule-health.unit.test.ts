/**
 * DetectionEngine.getRuleHealth() and RuleHealthTracker: static rule metadata (version,
 * severity, providers, supported provenance, test evidence, enabled state) combined with
 * tracked runtime counters (evaluations, matches, errors), and per-rule error isolation
 * (one throwing rule must not stop the rest of the ruleset or the whole evaluate() call).
 * Uses a real Redis connection, consistent with the rest of this repo's store tests.
 */
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import Redis from 'ioredis';
import { DetectionEngine } from '../src/modules/detection/engine.js';
import { RuleHealthTracker } from '../src/modules/detection/rule-health.js';
import { createNormalizedSecurityEvent } from '../src/modules/ingestion/security-event.schema.js';
import type { DetectionRule } from '../src/modules/detection/types.js';

function rootEvent() {
  return createNormalizedSecurityEvent({
    providerEventId: 'evt-1',
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
    principal: { id: 'arn:aws:iam::123456789012:root', type: 'Root', displayName: 'root' },
    rawEvent: {},
  });
}

describe('DetectionEngine rule health', () => {
  let redis: Redis;
  let ruleHealth: RuleHealthTracker;

  beforeEach(() => {
    redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      db: parseInt(process.env.REDIS_DB || '0', 10),
    });
    ruleHealth = new RuleHealthTracker(redis);
  });

  afterEach(async () => {
    await redis.flushdb();
    await redis.quit();
  });

  it('every registered rule exposes complete static health metadata', async () => {
    const engine = new DetectionEngine(undefined, undefined, ruleHealth);
    const health = await engine.getRuleHealth();
    expect(health.length).toBeGreaterThan(0);
    for (const rule of health) {
      expect(rule.enabled).toBe(true);
      expect(rule.version).toMatch(/^\d+\.\d+\.\d+$/);
      expect(rule.providers.length).toBeGreaterThan(0);
      expect(rule.supportedProvenance.length).toBeGreaterThan(0);
      expect(rule.testPaths.length).toBeGreaterThan(0);
    }
  });

  it('records an evaluation and a match for a rule that matches, without recording anything for a provider-mismatched rule', async () => {
    const engine = new DetectionEngine(undefined, undefined, ruleHealth);
    await engine.evaluate(rootEvent());

    const health = await engine.getRuleHealth();
    const awsIam001 = health.find((r) => r.id === 'AWS-IAM-001')!;
    expect(awsIam001.evaluationCount).toBe(1);
    expect(awsIam001.matchCount).toBe(1);
    expect(awsIam001.lastEvaluatedAt).toBeDefined();
    expect(awsIam001.lastMatchedAt).toBeDefined();

    // A gateway-only rule never even applies to an aws-provider event - not recorded as
    // an evaluation at all (it was never truly run), not just recorded as "no match".
    const gwAuth001 = health.find((r) => r.id === 'GW-AUTH-001')!;
    expect(gwAuth001.evaluationCount).toBe(0);
  });

  it('a disabled rule is skipped entirely and does not appear as evaluated', async () => {
    const disabledRule: DetectionRule = {
      id: 'TEST-DISABLED',
      name: 'test',
      description: 'test',
      version: '1.0.0',
      severity: 'low',
      providers: ['aws'],
      categories: ['other'],
      severityRationale: 'test',
      falsePositiveNotes: [],
      remediation: [],
      enabled: false,
      supportedProvenance: ['replay'],
      testPaths: ['test/rule-health.unit.test.ts'],
      evaluate: () => ({
        id: 'x',
        ruleId: 'TEST-DISABLED',
        ruleVersion: '1.0.0',
        title: 'x',
        description: 'x',
        severity: 'low',
        matchedFields: {},
        remediation: [],
        evidenceEventIds: [],
        correlationKey: 'x',
        falsePositiveNotes: [],
        severityRationale: 'x',
        createdAt: new Date().toISOString(),
        provenance: 'replay',
      }),
    };

    const engine = new DetectionEngine([disabledRule], undefined, ruleHealth);
    const detections = await engine.evaluate(rootEvent());
    expect(detections).toHaveLength(0);

    const health = await engine.getRuleHealth();
    expect(health[0].evaluationCount).toBe(0);
  });

  it('isolates a throwing rule: records an error, does not stop other rules from evaluating', async () => {
    const throwingRule: DetectionRule = {
      id: 'TEST-THROWS',
      name: 'test',
      description: 'test',
      version: '1.0.0',
      severity: 'low',
      providers: ['aws'],
      categories: ['other'],
      severityRationale: 'test',
      falsePositiveNotes: [],
      remediation: [],
      enabled: true,
      supportedProvenance: ['replay'],
      testPaths: ['test/rule-health.unit.test.ts'],
      evaluate: () => {
        throw new Error('boom');
      },
    };
    const workingRule: DetectionRule = {
      id: 'TEST-WORKS',
      name: 'test',
      description: 'test',
      version: '1.0.0',
      severity: 'low',
      providers: ['aws'],
      categories: ['other'],
      severityRationale: 'test',
      falsePositiveNotes: [],
      remediation: [],
      enabled: true,
      supportedProvenance: ['replay'],
      testPaths: ['test/rule-health.unit.test.ts'],
      evaluate: (event) => ({
        id: 'x',
        ruleId: 'TEST-WORKS',
        ruleVersion: '1.0.0',
        title: 'x',
        description: 'x',
        severity: 'low',
        matchedFields: {},
        remediation: [],
        evidenceEventIds: [event.id],
        correlationKey: 'x',
        falsePositiveNotes: [],
        severityRationale: 'x',
        createdAt: new Date().toISOString(),
        provenance: 'replay',
      }),
    };

    const engine = new DetectionEngine([throwingRule, workingRule], undefined, ruleHealth);
    // Must not throw, and must still return the working rule's match.
    const detections = await engine.evaluate(rootEvent());
    expect(detections).toHaveLength(1);
    expect(detections[0].ruleId).toBe('TEST-WORKS');

    const health = await engine.getRuleHealth();
    const throwingHealth = health.find((r) => r.id === 'TEST-THROWS')!;
    expect(throwingHealth.errorCount).toBe(1);
    expect(throwingHealth.lastErrorMessage).toContain('boom');
  });
});
