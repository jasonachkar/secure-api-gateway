/**
 * Guided scenarios: each one should drive the real detection/investigation
 * pipeline (not a separate simulation), stay confined to its dedicated demo
 * target, and be safely runnable by the read-only reviewer role.
 */
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { FastifyInstance } from 'fastify';
import { createApp } from '../src/app.js';

async function login(app: FastifyInstance, username: string, password: string) {
  const response = await app.inject({ method: 'POST', url: '/auth/login', payload: { username, password } });
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
    const ids = response.json().scenarios.map((s: { id: string }) => s.id).sort();
    expect(ids).toEqual(['aws-privileged-activity', 'gcp-credential-persistence', 'gw-credential-attack']);
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
    expect(result.investigationIds.length).toBeGreaterThan(0);
    expect(result.steps.find((s: { id: string }) => s.id === 'respond').status).toBe('completed');
    expect(result.steps.find((s: { id: string }) => s.id === 'verify').status).toBe('completed');

    // The scenario's own demo IP should now be genuinely blocked by the gateway.
    const blocked = await app.threatIntelService.isIPBlocked('203.0.113.50');
    expect(blocked).toBe(true);

    await app.scenarioService.resetGatewayScenario();
    expect(await app.threatIntelService.isIPBlocked('203.0.113.50')).toBe(false);
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
    const demoLoginResponse = await app.inject({ method: 'POST', url: '/auth/demo-login' });
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
    const demoLoginResponse = await app.inject({ method: 'POST', url: '/auth/demo-login' });
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
});
