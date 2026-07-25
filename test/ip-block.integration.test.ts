/**
 * Blocked-IP enforcement: the onRequest hook registered by registerIpBlockMiddleware
 * (see src/middleware/ipBlock.ts) should reject blocked IPs early with a 403,
 * leave health checks reachable, and let unblocked IPs through.
 */
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { FastifyInstance } from 'fastify';
import { createApp } from '../src/app.js';

describe('IP block enforcement (Integration)', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('allows an unblocked IP through', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/admin/security/capabilities',
      headers: { 'x-forwarded-for': '198.51.100.20' },
    });
    // Unauthenticated (401), not blocked (403) - proves the block check itself passed.
    expect(response.statusCode).not.toBe(403);
  });

  it('rejects a blocked IP with 403 and a request id, without leaking internals', async () => {
    const ip = '203.0.113.77';
    await app.threatIntelService.blockIP(ip, 'test-suite', 'ip-block integration test');

    const response = await app.inject({
      method: 'GET',
      url: '/admin/security/capabilities',
      headers: { 'x-forwarded-for': ip },
    });

    expect(response.statusCode).toBe(403);
    const body = response.json();
    expect(body.error.code).toBe('IP_BLOCKED');
    expect(body.requestId).toBeTruthy();
    expect(JSON.stringify(body)).not.toMatch(/redis|stack|internal/i);

    await app.threatIntelService.unblockIP(ip);
  });

  it('still allows /healthz through for a blocked IP (excluded path)', async () => {
    const ip = '192.0.2.99';
    await app.threatIntelService.blockIP(ip, 'test-suite', 'ip-block integration test');

    const response = await app.inject({
      method: 'GET',
      url: '/healthz',
      headers: { 'x-forwarded-for': ip },
    });

    expect(response.statusCode).toBe(200);
    await app.threatIntelService.unblockIP(ip);
  });

  it('records an enforcement sighting and audit entry when a blocked IP is rejected', async () => {
    const ip = '203.0.113.201';
    // Go through responseService.blockIp() (not threatIntelService directly) so a
    // ResponseActionRecord is persisted, matching how a real block is enforced.
    await app.responseService.blockIp({ ip, actor: 'test-suite', reason: 'ip-block integration test' });

    await app.inject({
      method: 'GET',
      url: '/admin/security/capabilities',
      headers: { 'x-forwarded-for': ip },
    });

    const actions = await app.responseService.listActions();
    // Blocking itself is recorded as a response action; the rejected follow-up
    // request is tracked via recordEnforcementSighting (Redis list), not a
    // second response action - assert audit picked up the blocked-request event instead.
    expect(actions.some((a) => a.target === ip)).toBe(true);

    const auditLogs = await app.audit.query({ eventType: 'SECURITY_IP_BLOCKED_REQUEST', limit: 1000 });
    expect(auditLogs.some((entry) => entry.ip === ip)).toBe(true);

    await app.threatIntelService.unblockIP(ip);
  });
});
