/**
 * ComplianceService.getComplianceMetrics(): every framework must carry an honest
 * assessmentBasis/assessmentNote, and NIST's AC-2 control must actually react to
 * live account-lockout telemetry - the property that stops all four framework scores
 * from rendering identically regardless of whether they're measured or fixed (see
 * docs/KNOWN_LIMITATIONS.md#compliance-scores-mix-live-telemetry-and-fixed-self-assessment).
 */
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import Redis from 'ioredis';
import { ComplianceService } from '../src/modules/admin/compliance.service.js';
import { MetricsService } from '../src/modules/admin/metrics.service.js';
import { ThreatIntelService } from '../src/modules/admin/threat-intel.service.js';

describe('ComplianceService.getComplianceMetrics', () => {
  let redis: Redis;
  let metricsService: MetricsService;
  let service: ComplianceService;

  beforeAll(() => {
    redis = new Redis({
      host: process.env.REDIS_HOST,
      port: Number(process.env.REDIS_PORT),
      db: Number(process.env.REDIS_DB),
      maxRetriesPerRequest: 1,
    });
    metricsService = new MetricsService(redis);
    service = new ComplianceService(redis, metricsService, new ThreatIntelService(redis));
  });

  afterAll(() => {
    redis.disconnect();
  });

  it('tags OWASP, PCI, and GDPR as static self-assessments, not live measurements', async () => {
    const metrics = await service.getComplianceMetrics();

    expect(metrics.owasp.assessmentBasis).toBe('static');
    expect(metrics.owasp.assessmentNote.length).toBeGreaterThan(0);
    expect(metrics.pci.assessmentBasis).toBe('static');
    expect(metrics.pci.assessmentNote.length).toBeGreaterThan(0);
    expect(metrics.gdpr.assessmentBasis).toBe('static');
    expect(metrics.gdpr.assessmentNote.length).toBeGreaterThan(0);
  });

  it('tags NIST as partially-live and reflects real account-lockout telemetry in AC-2', async () => {
    const before = await service.getComplianceMetrics();
    expect(before.nist.assessmentBasis).toBe('partially-live');
    const ac2Before = before.nist.controls.find((c) => c.id === 'AC-2');
    expect(ac2Before?.status).toBe('partial'); // no lockouts recorded yet on a clean DB

    // Record a real account-lockout auth event through MetricsService's own public API
    // (not a hand-crafted Redis key) so this test tracks real behavior, not an assumption
    // about MetricsService's internal key format.
    await metricsService.recordAuthEvent({
      type: 'account_locked',
      username: 'test-user',
      ip: '203.0.113.1',
    });

    const after = await service.getComplianceMetrics();
    const ac2After = after.nist.controls.find((c) => c.id === 'AC-2');
    expect(ac2After?.status).toBe('compliant');
  });

  it('never lets a static-basis score claim 100% coincidentally look like a live measurement without its note', async () => {
    const metrics = await service.getComplianceMetrics();
    // GDPR is documented as always 100 - this test exists to catch anyone "fixing" that by
    // deleting the disclosure rather than making the score genuinely live.
    expect(metrics.gdpr.score).toBe(100);
    expect(metrics.gdpr.assessmentBasis).toBe('static');
  });
});

describe('ComplianceService.calculateSecurityPosture', () => {
  let redis: Redis;
  let service: ComplianceService;

  beforeAll(() => {
    redis = new Redis({
      host: process.env.REDIS_HOST,
      port: Number(process.env.REDIS_PORT),
      db: Number(process.env.REDIS_DB),
      maxRetriesPerRequest: 1,
    });
    service = new ComplianceService(redis, new MetricsService(redis), new ThreatIntelService(redis));
  });

  afterAll(() => {
    redis.disconnect();
  });

  it('discloses that auditLogging is a fixed baseline, and never fabricates unmeasured detail fields', async () => {
    const posture = await service.calculateSecurityPosture();

    expect(posture.assessmentNote.length).toBeGreaterThan(0);
    expect(posture.assessmentNote.toLowerCase()).toContain('auditlogging');

    // These fields were removed for being pure fabrication (no live signal behind them
    // at all) - this test exists so nobody re-adds a fake number under these names.
    expect(posture.factors.authentication.details).not.toHaveProperty('sessionSecurity');
    expect(posture.factors.threatIntelligence.details).not.toHaveProperty('threatResponseTime');
    expect(posture.factors.rateLimiting.details).not.toHaveProperty('coverage');
    expect(posture.factors.auditLogging.details).not.toHaveProperty('logCoverage');
    expect(posture.factors.auditLogging.details).not.toHaveProperty('retentionDays');

    // mfaEnabled is kept, but only because it's an accurate statement (MFA isn't
    // implemented), not a stand-in for a real measurement.
    expect(posture.factors.authentication.details.mfaEnabled).toBe(false);
  });
});
