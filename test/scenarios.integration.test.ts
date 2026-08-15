/**
 * Guided scenarios: each one should drive the real detection/investigation
 * pipeline (not a separate simulation), stay confined to its dedicated demo
 * target, and be safely runnable by the read-only reviewer role.
 */
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { FastifyInstance } from 'fastify';
import { createApp } from '../src/app.js';

async function login(app: FastifyInstance, username: string, password: string) {
  const response = await app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { username, password },
    headers: { origin: 'http://localhost:3000' },
  });
  expect(response.statusCode).toBe(200);
  return response.json().accessToken as string;
}

describe('Guided scenarios (Integration)', () => {
  let app: FastifyInstance;
  let adminToken: string;

  beforeAll(async () => {
    app = await createApp();
    await app.ready();
    adminToken = await login(app, 'admin', 'Admin123!');
  });

  afterAll(async () => {
    await app.scenarioService.resetGatewayScenario();
    await app.close();
  });

  it('lists all 3 required scenarios', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/admin/scenarios',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(response.statusCode).toBe(200);
    const ids = response
      .json()
      .scenarios.map((s: { id: string }) => s.id)
      .sort();
    expect(ids).toEqual([
      'aws-privileged-activity',
      'gcp-credential-persistence',
      'gw-credential-attack',
    ]);
  });

  it('runs the AWS replay scenario and produces a real detection + investigation', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/admin/scenarios/aws-privileged-activity/run',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(response.statusCode).toBe(200);
    const { result } = response.json();
    expect(result.provenance).toBe('replay');
    expect(result.detectionIds.length).toBeGreaterThan(0);
    expect(result.investigationIds.length).toBeGreaterThan(0);
    expect(result.steps.map((s: { id: string }) => s.id)).toEqual([
      'generate',
      'normalize',
      'detect',
      'correlate',
      'respond',
      'verify',
    ]);
  });

  it('runs the GCP replay scenario', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/admin/scenarios/gcp-credential-persistence/run',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(response.statusCode).toBe(200);
    const { result } = response.json();
    expect(result.detectionIds.length).toBeGreaterThan(0);
  });

  it('runs the live gateway-credential-attack scenario end to end and enforces a real IP block', async () => {
    await app.scenarioService.resetGatewayScenario();

    const response = await app.inject({
      method: 'POST',
      url: '/admin/scenarios/gw-credential-attack/run',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(response.statusCode).toBe(200);
    const { result } = response.json();

    expect(result.provenance).toBe('live');
    expect(result.eventIds.length).toBeGreaterThan(0);
    expect(result.detectionIds.length).toBeGreaterThan(0);
    expect(result.investigationIds.length).toBeGreaterThan(0);
    for (const stepId of ['generate', 'normalize', 'detect', 'correlate', 'respond', 'verify']) {
      expect(result.steps.find((s: { id: string }) => s.id === stepId).status).toBe('completed');
    }

    // Don't just trust the scenario's own reported step status - independently send a
    // real HTTP request from the scenario IP and confirm it is genuinely rejected
    // (403/IP_BLOCKED/a request id), not merely a Redis membership check.
    const rejected = await app.inject({
      method: 'GET',
      url: '/admin/security/capabilities',
      headers: { authorization: `Bearer ${adminToken}`, 'x-forwarded-for': '203.0.113.50' },
    });
    expect(rejected.statusCode).toBe(403);
    const rejectedBody = rejected.json();
    expect(rejectedBody.error.code).toBe('IP_BLOCKED');
    expect(rejectedBody.requestId).toBeTruthy();

    // And confirm the rejection produced a real audit entry, not just an HTTP response.
    const auditLogs = await app.audit.query({
      eventType: 'SECURITY_IP_BLOCKED_REQUEST',
      limit: 50,
    });
    expect(auditLogs.some((entry: { ip: string }) => entry.ip === '203.0.113.50')).toBe(true);

    // Idempotency: re-running immediately, with no reset in between, must not crash or
    // silently fail just because the account/IP are already locked/blocked. The
    // scenario's own login attempts are themselves now rejected at the edge by the very
    // IP-block middleware the first run just enforced - real proof enforcement is
    // persistent, not an error state - so the rerun should recognize that and report the
    // already-existing investigation/enforcement rather than generating a redundant
    // attack (a second `it()` block would need its own fresh lockout sequence first,
    // which would exhaust the real auth rate limiter for this IP given the previous
    // block above already spent most of its budget - so this is checked as a direct
    // continuation instead).
    const rerun = await app.inject({
      method: 'POST',
      url: '/admin/scenarios/gw-credential-attack/run',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(rerun.statusCode).toBe(200);
    const rerunResult = rerun.json().result;
    for (const stepId of ['generate', 'normalize', 'detect', 'correlate', 'respond', 'verify']) {
      expect(rerunResult.steps.find((s: { id: string }) => s.id === stepId).status).toBe(
        'completed'
      );
    }
    expect(rerunResult.investigationIds[0]).toBe(result.investigationIds[0]); // same case, not a duplicate

    await app.scenarioService.resetGatewayScenario();
    const afterReset = await app.inject({
      method: 'GET',
      url: '/admin/security/capabilities',
      headers: { authorization: `Bearer ${adminToken}`, 'x-forwarded-for': '203.0.113.50' },
    });
    expect(afterReset.statusCode).not.toBe(403);
  });

  it('rejects an unknown scenario id', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/admin/scenarios/not-a-real-scenario/run',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(response.statusCode).toBe(404);
  });

  it('allows the read-only reviewer role (via one-click demo login) to run scenarios', async () => {
    const demoLoginResponse = await app.inject({
      method: 'POST',
      url: '/auth/demo-login',
      headers: { origin: 'http://localhost:3000' },
    });
    expect(demoLoginResponse.statusCode).toBe(200);
    const reviewerToken = demoLoginResponse.json().accessToken as string;

    const response = await app.inject({
      method: 'POST',
      url: '/admin/scenarios/aws-privileged-activity/run',
      headers: { authorization: `Bearer ${reviewerToken}` },
    });
    expect(response.statusCode).toBe(200);
  });

  it('blocks the reviewer role from mutating admin endpoints outside the allowlisted scenario actions', async () => {
    const demoLoginResponse = await app.inject({
      method: 'POST',
      url: '/auth/demo-login',
      headers: { origin: 'http://localhost:3000' },
    });
    const reviewerToken = demoLoginResponse.json().accessToken as string;

    const blockAttempt = await app.inject({
      method: 'POST',
      url: '/admin/threats/ip/198.51.100.9/block',
      headers: { authorization: `Bearer ${reviewerToken}` },
      payload: { reason: 'should be forbidden for reviewer' },
    });
    expect(blockAttempt.statusCode).toBe(403);

    const revokeAttempt = await app.inject({
      method: 'POST',
      url: '/admin/security/response/revoke-sessions',
      headers: { authorization: `Bearer ${reviewerToken}` },
      payload: { userId: 'user-1', reason: 'should be forbidden for reviewer' },
    });
    expect(revokeAttempt.statusCode).toBe(403);
  });

  it('gives reviewers the full read-only dashboard through server-side sanitized projections', async () => {
    const demoLoginResponse = await app.inject({
      method: 'POST',
      url: '/auth/demo-login',
      headers: { origin: 'http://localhost:3000' },
    });
    expect(demoLoginResponse.statusCode).toBe(200);
    const reviewerToken = demoLoginResponse.json().accessToken as string;
    const authorization = { authorization: `Bearer ${reviewerToken}` };

    for (const url of [
      '/admin/ingestion/status',
      '/admin/audit/logs?limit=100',
      '/admin/audit/admin-actions?limit=100',
      '/admin/health',
      '/admin/config',
      '/admin/threats?limit=20',
      '/admin/threats/top?limit=20',
      '/admin/threats/statistics',
      '/admin/threats/patterns',
      '/admin/compliance/posture',
      '/admin/compliance/metrics',
    ]) {
      const response = await app.inject({ method: 'GET', url, headers: authorization });
      expect(response.statusCode).toBe(200);
    }

    const ingestionResponse = await app.inject({
      method: 'GET',
      url: '/admin/ingestion/status',
      headers: authorization,
    });
    for (const adapter of ingestionResponse.json().status.adapters as Array<{
      cursor?: string;
      detail: string;
    }>) {
      expect(adapter.cursor).toBeUndefined();
      expect(['Not configured', 'Configured and healthy', 'Configured; provider polling is degraded'])
        .toContain(adapter.detail);
    }

    const sessionsResponse = await app.inject({
      method: 'GET',
      url: '/admin/sessions/active',
      headers: authorization,
    });
    expect(sessionsResponse.statusCode).toBe(200);
    const sessions = sessionsResponse.json().sessions as Array<{
      jti: string;
      userId: string;
      lastKnownIp: string;
    }>;
    expect(sessions.length).toBeGreaterThan(0);
    expect(sessions.every((session) => session.userId === 'user-5')).toBe(true);
    expect(sessions.every((session) => session.jti.startsWith('reviewer-session-'))).toBe(true);
    expect(sessions.every((session) => /^192\.0\.2\.\d+$/.test(session.lastKnownIp))).toBe(true);

    const usersResponse = await app.inject({
      method: 'GET',
      url: '/admin/users',
      headers: authorization,
    });
    expect(usersResponse.statusCode).toBe(200);
    expect(usersResponse.json().users).toEqual([
      expect.objectContaining({ userId: 'user-5', username: 'reviewer', roles: ['reviewer'] }),
    ]);

    const auditResponse = await app.inject({
      method: 'GET',
      url: '/admin/audit/admin-actions?limit=100',
      headers: authorization,
    });
    const auditEntries = auditResponse.json().logs as Array<{ actor: { userId: string } }>;
    expect(auditEntries.every((entry) => entry.actor.userId === 'user-5')).toBe(true);

    const trafficResponse = await app.inject({
      method: 'GET',
      url: '/admin/requests/live?limit=100',
      headers: authorization,
    });
    expect(trafficResponse.statusCode).toBe(200);
    const traffic = trafficResponse.json().requests as Array<{ sourceIp: string; user: string }>;
    expect(traffic.length).toBeGreaterThan(0);
    expect(traffic.every((entry) => /^192\.0\.2\.\d+$/.test(entry.sourceIp))).toBe(true);
    expect(traffic.some((entry) => entry.user.includes('admin'))).toBe(false);

    const forbiddenWrites = [
      { method: 'POST', url: `/admin/sessions/${sessions[0].jti}/revoke`, payload: {} },
      { method: 'POST', url: '/admin/users/user-5/unlock', payload: {} },
      {
        method: 'POST',
        url: '/admin/threats/ip/198.51.100.10/block',
        payload: { reason: 'reviewers cannot mutate enforcement state' },
      },
    ];
    for (const request of forbiddenWrites) {
      const response = await app.inject({ ...request, headers: authorization });
      expect(response.statusCode).toBe(403);
    }
  });
});
