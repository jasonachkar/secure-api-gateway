/**
 * CORS Integration Test
 * Regression test: the CORS plugin used to be configured with `origin: true` (allow
 * every origin, with credentials enabled) regardless of the validated CORS_ORIGIN
 * allowlist - env.ts checked it, but app.ts never actually used it. Fixed to apply
 * env.security.corsOrigins as the real allowlist.
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { FastifyInstance } from 'fastify';
import { createApp } from '../src/app.js';

describe('CORS (Integration)', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('reflects an allowlisted origin (test/setup.ts sets CORS_ORIGIN=http://localhost:3000)', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/healthz',
      headers: { origin: 'http://localhost:3000' },
    });

    expect(response.headers['access-control-allow-origin']).toBe('http://localhost:3000');
  });

  it('does not reflect a non-allowlisted origin', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/healthz',
      headers: { origin: 'https://evil.example.com' },
    });

    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });
});
