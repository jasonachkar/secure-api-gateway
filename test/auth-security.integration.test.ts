import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import type { FastifyInstance } from 'fastify';
import { createApp } from '../src/app.js';

const TRUSTED_ORIGIN = 'http://localhost:3000';

describe('authentication security boundaries', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it.each([undefined, 'https://untrusted.example'])('rejects missing or untrusted Origin: %s', async (origin) => {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/demo-login',
      headers: origin ? { origin } : undefined,
    });

    expect(response.statusCode).toBe(403);
    expect(response.json().error).toMatchObject({ code: 'FORBIDDEN' });
  });

  it('allows explicit CORS preflight without invoking the credential-operation guard', async () => {
    const response = await app.inject({
      method: 'OPTIONS',
      url: '/auth/demo-login',
      headers: {
        origin: TRUSTED_ORIGIN,
        'access-control-request-method': 'POST',
      },
    });

    expect(response.statusCode).toBe(204);
    expect(response.headers['access-control-allow-origin']).toBe(TRUSTED_ORIGIN);
  });

  it('sets a development refresh cookie with the shared /auth policy', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/demo-login',
      headers: { origin: TRUSTED_ORIGIN, 'x-forwarded-for': '198.51.100.10' },
    });

    expect(response.statusCode).toBe(200);
    const setCookie = response.headers['set-cookie'];
    expect(setCookie).toContain('refreshToken=');
    expect(setCookie).toContain('Path=/auth');
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Lax');
    expect(setCookie).not.toContain('Secure');
  });

  it('does not reveal whether an unknown account exists', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/login',
      headers: { origin: TRUSTED_ORIGIN, 'x-forwarded-for': '198.51.100.11' },
      payload: { username: 'unknown-account', password: 'WrongPassword!' },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json().error).toMatchObject({
      code: 'INVALID_CREDENTIALS',
      message: 'Invalid credentials',
    });
  });

  it('returns Retry-After when an account becomes locked', async () => {
    let response;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      response = await app.inject({
        method: 'POST',
        url: '/auth/login',
        headers: { origin: TRUSTED_ORIGIN, 'x-forwarded-for': '198.51.100.12' },
        payload: { username: 'service', password: 'WrongPassword!' },
      });
    }

    expect(response!.statusCode).toBe(401);
    expect(response!.json().error.code).toBe('ACCOUNT_LOCKED');
    expect(Number(response!.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('revokes the current refresh token when a rotated ancestor is replayed', async () => {
    const login = await app.inject({
      method: 'POST',
      url: '/auth/demo-login',
      headers: { origin: TRUSTED_ORIGIN, 'x-forwarded-for': '198.51.100.13' },
    });
    const original = login.cookies.find((cookie) => cookie.name === 'refreshToken')!.value;

    const rotation = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      headers: { origin: TRUSTED_ORIGIN, 'x-forwarded-for': '198.51.100.13' },
      cookies: { refreshToken: original },
    });
    expect(rotation.statusCode).toBe(200);
    const current = rotation.cookies.find((cookie) => cookie.name === 'refreshToken')!.value;

    const replay = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      headers: { origin: TRUSTED_ORIGIN, 'x-forwarded-for': '198.51.100.13' },
      cookies: { refreshToken: original },
    });
    expect(replay.statusCode).toBe(401);
    expect(replay.json().error.code).toBe('TOKEN_REVOKED');

    const familyMember = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      headers: { origin: TRUSTED_ORIGIN, 'x-forwarded-for': '198.51.100.13' },
      cookies: { refreshToken: current },
    });
    expect(familyMember.statusCode).toBe(401);
    expect(familyMember.json().error.code).toBe('TOKEN_REVOKED');
  });

  it('keeps liveness independent while readiness reports Redis failure as 503', async () => {
    const ping = jest.spyOn(app.redis, 'ping').mockRejectedValueOnce(new Error('redis unavailable'));

    const liveness = await app.inject({ method: 'GET', url: '/healthz' });
    const readiness = await app.inject({ method: 'GET', url: '/readyz' });

    expect(liveness.statusCode).toBe(200);
    expect(liveness.json().status).toBe('ok');
    expect(readiness.statusCode).toBe(503);
    expect(readiness.json()).toMatchObject({ status: 'degraded', redis: 'error' });
    expect(readiness.body).not.toContain('unavailable');
    ping.mockRestore();
  });
});
