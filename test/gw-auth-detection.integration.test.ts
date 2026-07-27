/**
 * GW-AUTH-001 real signal wiring: every failed login - not just the final lockout -
 * must feed the canonical pipeline with the real measured failure count and distinct
 * source-IP count (gateway-auth-tracker.ts), so both "concentrated" (many attempts,
 * one source) and "distributed" (many attempts, many sources) credential-attack
 * patterns are genuinely detectable - not just a single post-lockout event carrying a
 * hardcoded threshold value. Uses a real app + real Redis, consistent with the other
 * integration tests in this repo.
 */
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import type { FastifyInstance } from 'fastify';

async function login(app: FastifyInstance, username: string, password: string, ip: string) {
  return app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { username, password },
    headers: { 'x-forwarded-for': ip },
  });
}

describe('GW-AUTH-001 distributed detection (default config)', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { createApp } = require('../src/app.js');
    app = await createApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('detects a distributed attack (3+ distinct IPs against one account) without any single IP reaching lockout', async () => {
    const username = 'gw-auth-distributed-target';
    const ips = ['198.51.100.11', '198.51.100.12', '198.51.100.13'];

    for (const ip of ips) {
      // One attempt per IP - well under the per-(username,ip) lockout threshold, so
      // lockout (which is scoped per username+IP pair) never engages for any of them.
      const res = await login(app, username, 'wrong-password', ip);
      expect(res.statusCode).toBe(401);
      expect(res.json().error.code).not.toBe('ACCOUNT_LOCKED');
    }

    // correlationKey on the persisted investigation is a SHA-256 hash of the rule's raw
    // key + time bucket (see correlation.ts#buildCorrelationKey), not a matchable
    // string - find the investigation via its affected principal instead.
    const investigations = await app.investigationService.listInvestigations({});
    const match = investigations.find((inv: { affectedPrincipals: Array<{ id?: string }> }) =>
      inv.affectedPrincipals.some((p) => p.id === username)
    );
    expect(match).toBeDefined();
    expect(match!.provenance).toBe('live');

    const detections = await app.detectionStore.getByIds(match!.detectionIds);
    const gwAuth001 = detections.find((d: { ruleId: string }) => d.ruleId === 'GW-AUTH-001');
    expect(gwAuth001).toBeDefined();
    // Real measured numbers, not a hardcoded constant.
    expect(gwAuth001!.matchedFields.distinctSourceIps).toBeGreaterThanOrEqual(3);
    expect(gwAuth001!.matchedFields.failedLoginCount).toBeGreaterThanOrEqual(3);
  });
});

describe('GW-AUTH-001 concentrated detection (raised thresholds so it fires before lockout)', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    // Raise both the lockout threshold and the auth rate limit well above the rule's
    // own concentrated-detection threshold (5) and this test's attempt count (5), so we
    // can observe detection firing on real per-attempt counts *before* lockout, in a
    // dedicated app instance/env rather than perturbing the shared default test config.
    process.env.MAX_LOGIN_ATTEMPTS = '10';
    process.env.RATE_LIMIT_AUTH_MAX = '20';
    jest.resetModules();
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { createApp } = require('../src/app.js');
    app = await createApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    delete process.env.MAX_LOGIN_ATTEMPTS;
    delete process.env.RATE_LIMIT_AUTH_MAX;
    jest.resetModules();
  });

  it('detects a concentrated attack (5 failed attempts, one source) before the account is locked out', async () => {
    const username = 'gw-auth-concentrated-target';
    const ip = '198.51.100.20';

    for (let i = 0; i < 5; i++) {
      const res = await login(app, username, 'wrong-password', ip);
      expect(res.statusCode).toBe(401);
      expect(res.json().error.code).not.toBe('ACCOUNT_LOCKED'); // lockout threshold is 10, not reached
    }

    const investigations = await app.investigationService.listInvestigations({});
    const match = investigations.find((inv: { affectedPrincipals: Array<{ id?: string }> }) =>
      inv.affectedPrincipals.some((p) => p.id === username)
    );
    expect(match).toBeDefined();

    const detections = await app.detectionStore.getByIds(match!.detectionIds);
    const gwAuth001 = detections.find((d: { ruleId: string }) => d.ruleId === 'GW-AUTH-001');
    expect(gwAuth001).toBeDefined();
    expect(gwAuth001!.matchedFields.failedLoginCount).toBe(5);
  });
});
