/**
 * Evidence export: bundles an investigation's events, detections, response
 * actions, and audit-chain verification into a redacted, self-explaining package.
 */
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { FastifyInstance } from 'fastify';
import { createApp } from '../src/app.js';

describe('Evidence export (Integration)', () => {
  let app: FastifyInstance;
  let adminToken: string;

  beforeAll(async () => {
    app = await createApp();
    await app.ready();
    const login = await app.inject({ method: 'POST', url: '/auth/login', payload: { username: 'admin', password: 'Admin123!' } });
    adminToken = login.json().accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  it('exports a redacted evidence package for a real replay-produced investigation', async () => {
    const replay = await app.inject({
      method: 'POST',
      url: '/admin/security/replay',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { fixtureId: 'aws/cloudtrail-root-activity' },
    });
    const investigationId = replay.json().investigations[0].id;

    const exportResponse = await app.inject({
      method: 'GET',
      url: `/admin/security/investigations/${investigationId}/evidence-export`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(exportResponse.statusCode).toBe(200);

    const pkg = exportResponse.json();
    expect(pkg['investigation.json'].id).toBe(investigationId);
    expect(Array.isArray(pkg['normalized-events.json'])).toBe(true);
    expect(pkg['normalized-events.json'].length).toBeGreaterThan(0);
    expect(Array.isArray(pkg['detections.json'])).toBe(true);
    expect(pkg['detections.json'][0].ruleId).toBe('AWS-IAM-001');
    expect(typeof pkg['audit-verification.json'].chainValid).toBe('boolean');
    expect(pkg['README.txt']).toContain('tamper-evident');
    expect(pkg['README.txt']).toContain(investigationId);
  });

  it('404s for an unknown investigation id', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/admin/security/investigations/does-not-exist/evidence-export',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(response.statusCode).toBe(404);
  });
});
