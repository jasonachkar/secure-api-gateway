/**
 * GW-TOKEN-001 real signal wiring: every JWT verification failure on a protected route -
 * invalid signature, malformed token, expired token, wrong token type, privileged-route
 * failure, and revoked-token reuse - must feed the canonical pipeline
 * (middleware/auth.ts#evaluateTokenFailure), never just exist as a 401 response with no
 * trace. Uses a real app + real Redis, consistent with the other integration tests in
 * this repo.
 */
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import type { FastifyInstance } from 'fastify';
import { createApp } from '../src/app.js';

async function login(app: FastifyInstance, username = 'admin', password = 'Admin123!') {
  const res = await app.inject({ method: 'POST', url: '/auth/login', payload: { username, password } });
  expect(res.statusCode).toBe(200);
  return res.json() as { accessToken: string };
}

async function findDetectionByAction(app: FastifyInstance, actionSubstring: string) {
  const investigations = await app.investigationService.listInvestigations({ limit: 200 });
  for (const inv of investigations) {
    const detections = await app.detectionStore.getByIds(inv.detectionIds);
    const found = detections.find(
      (d) => d.ruleId === 'GW-TOKEN-001' && String(d.matchedFields.action).includes(actionSubstring)
    );
    if (found) return { detection: found, investigation: inv };
  }
  return undefined;
}

describe('GW-TOKEN-001 real signal wiring (Integration)', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('invalid signature (tampered JWT) produces a jwt.tampered event and a GW-TOKEN-001 match', async () => {
    const { accessToken } = await login(app);
    // Flip the last character of the signature segment - structurally valid JWT shape,
    // invalid signature.
    const parts = accessToken.split('.');
    const tamperedSig = parts[2].slice(0, -1) + (parts[2].slice(-1) === 'a' ? 'b' : 'a');
    const tampered = `${parts[0]}.${parts[1]}.${tamperedSig}`;

    const res = await app.inject({
      method: 'GET',
      url: '/admin/security/capabilities',
      headers: { authorization: `Bearer ${tampered}` },
    });
    expect(res.statusCode).toBe(401);

    const match = await findDetectionByAction(app, 'jwt.tampered');
    expect(match).toBeDefined();
  });

  it('a malformed token (not a JWT at all) produces a jwt.invalid event and a GW-TOKEN-001 match', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/admin/security/capabilities',
      headers: { authorization: 'Bearer not-a-real-jwt-at-all' },
    });
    expect(res.statusCode).toBe(401);

    const match = await findDetectionByAction(app, 'jwt.invalid');
    expect(match).toBeDefined();
  });

  it('an invalid token type (refresh token used as access token) produces a token.invalid_type event and a GW-TOKEN-001 match', async () => {
    const loginRes = await app.inject({ method: 'POST', url: '/auth/login', payload: { username: 'admin', password: 'Admin123!' } });
    const refreshCookie = loginRes.cookies.find((c) => c.name === 'refreshToken');
    expect(refreshCookie).toBeDefined();

    const res = await app.inject({
      method: 'GET',
      url: '/admin/security/capabilities',
      headers: { authorization: `Bearer ${refreshCookie!.value}` },
    });
    expect(res.statusCode).toBe(401);

    const match = await findDetectionByAction(app, 'token.invalid_type');
    expect(match).toBeDefined();
  });

  it('a privileged-route failure (admin route) is tagged privileged_jwt_failure and matches GW-TOKEN-001', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/admin/security/capabilities',
      headers: { authorization: 'Bearer garbage-token-value' },
    });
    expect(res.statusCode).toBe(401);

    const match = await findDetectionByAction(app, 'privileged_jwt_failure');
    expect(match).toBeDefined();
    expect(match!.investigation.severity).toBe('critical'); // privileged-route failures are elevated
  });

  it('revoked access token reuse produces a token.revoked event and a GW-TOKEN-001 match', async () => {
    const { accessToken } = await login(app);

    const logoutRes = await app.inject({
      method: 'POST',
      url: '/auth/logout',
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(logoutRes.statusCode).toBe(200);

    const reuseRes = await app.inject({
      method: 'GET',
      url: '/admin/security/capabilities',
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(reuseRes.statusCode).toBe(401);
    expect(reuseRes.json().error.code).toBe('TOKEN_REVOKED');

    const match = await findDetectionByAction(app, 'token.revoked');
    expect(match).toBeDefined();
  });

  it('an expired token generates a canonical event but does not match GW-TOKEN-001 (avoids alert fatigue on routine expiry)', async () => {
    // Signed with an already-past expiry - same mechanism jsonwebtoken uses for real
    // token expiry, just constructed directly rather than waiting out a real TTL.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const jwt = require('jsonwebtoken');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { env } = require('../src/config/index.js');
    const secret = env.auth.jwt.algorithm === 'RS256' ? env.auth.jwt.privateKey : env.auth.jwt.secret;
    const expiredToken = jwt.sign(
      { sub: 'u1', username: 'admin', roles: ['admin'], permissions: [], jti: 'expired-jti-test', type: 'access' },
      secret,
      { algorithm: env.auth.jwt.algorithm, expiresIn: -10 }
    );

    const res = await app.inject({
      method: 'GET',
      url: '/admin/security/capabilities',
      headers: { authorization: `Bearer ${expiredToken}` },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('TOKEN_EXPIRED');

    // Most-recent-first, so the event this request just created is reliably present near
    // the front regardless of how many gateway events earlier tests in this file left
    // behind (a raw count comparison isn't reliable once accumulated state exceeds a
    // fetch limit on both sides of the comparison).
    const afterEvents = await app.securityEventStore.listEvents({ provider: 'gateway', limit: 20 });
    expect(afterEvents.some((e) => e.action === 'jwt.expired')).toBe(true);

    const match = await findDetectionByAction(app, 'jwt.expired');
    expect(match).toBeUndefined(); // deliberately excluded from the rule's signal set
  });
});
