/**
 * Enforced session revocation: responseService.revokeSessions() should
 * actually invalidate a user's refresh-token sessions via TokenStore's
 * user index (see token.store.ts revokeAllForUser), not just simulate it.
 */
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { FastifyInstance } from 'fastify';
import { createApp } from '../src/app.js';

describe('Session revocation (Integration)', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('stores a refresh token under the user index and revokes it via revokeAllForUser', async () => {
    const userId = 'revoke-test-user';
    await app.tokenStore.store(
      'jti-1',
      { userId, username: 'revoke-test', family: 'family-1', issuedAt: Date.now() } as any,
      3600
    );

    expect(await app.tokenStore.isRevoked('jti-1')).toBe(false);

    const revokedCount = await app.tokenStore.revokeAllForUser(userId);
    expect(revokedCount).toBe(1);
    expect(await app.tokenStore.isRevoked('jti-1')).toBe(true);
  });

  it('responseService.revokeSessions records an enforced, successful response action', async () => {
    const userId = 'revoke-test-user-2';
    await app.tokenStore.store(
      'jti-2',
      { userId, username: 'revoke-test-2', family: 'family-2', issuedAt: Date.now() } as any,
      3600
    );

    const record = await app.responseService.revokeSessions({
      userId,
      username: 'revoke-test-2',
      actor: 'test-suite',
      reason: 'session-revoke integration test',
    });

    expect(record.mode).toBe('enforced');
    expect(record.result).toBe('success');
    expect(await app.tokenStore.isRevoked('jti-2')).toBe(true);
  });

  it('revoking a session blocks subsequent use of its access token', async () => {
    const loginResponse = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { username: 'user', password: 'User123!' },
    });
    expect(loginResponse.statusCode).toBe(200);
    const { accessToken } = loginResponse.json();

    const beforeRevoke = await app.inject({
      method: 'GET',
      url: '/admin/health',
      headers: { authorization: `Bearer ${accessToken}` },
    });
    // 'user' isn't admin, so this is a 403 (authenticated, forbidden) not 401 -
    // proves the token itself was accepted before revocation.
    expect(beforeRevoke.statusCode).toBe(403);

    await app.responseService.revokeSessions({
      userId: 'user-2',
      actor: 'test-suite',
      reason: 'session-revoke integration test',
    });

    const afterRevoke = await app.inject({
      method: 'GET',
      url: '/admin/health',
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(afterRevoke.statusCode).toBe(401);
  });
});
