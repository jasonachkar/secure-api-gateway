/**
 * Proxy trust boundary (src/lib/proxyTrust.ts + getClientIp in src/lib/requestContext.ts).
 *
 * Client IP drives rate limiting, account lockout, IP blocking, threat scoring, and audit
 * evidence, so this is the thing that decides whether a direct client can spoof its way
 * around every one of those controls by sending a fake X-Forwarded-For. Builds a minimal
 * Fastify app per test (module cache reset so each test gets its own PROXY_TRUST_* env)
 * and asserts end-to-end IP resolution through `request.ip` -> getClientIp(), exactly the
 * path every real route uses.
 */
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';

const ORIGINAL_ENV = { ...process.env };

function resetEnv(overrides: Record<string, string | undefined>) {
  process.env = { ...ORIGINAL_ENV, ...overrides };
}

/** Build a throwaway Fastify app with the current env's resolved trust-proxy option. */
async function buildTestApp() {
  jest.resetModules();
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const Fastify = require('fastify').default;
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { resolveTrustProxyOption } = require('../src/lib/proxyTrust.js');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { getClientIp } = require('../src/lib/requestContext.js');

  const app = Fastify({ trustProxy: resolveTrustProxyOption() });
  app.get('/whoami', async (request: any) => ({ ip: getClientIp(request) }));
  await app.ready();
  return app;
}

describe('proxy trust boundary', () => {
  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });

  describe('mode=none (direct client / local dev)', () => {
    beforeEach(() => resetEnv({ NODE_ENV: 'test', PROXY_TRUST_MODE: 'none' }));

    it('ignores a spoofed X-Forwarded-For and resolves to the real connection address', async () => {
      const app = await buildTestApp();
      const res = await app.inject({
        method: 'GET',
        url: '/whoami',
        remoteAddress: '203.0.113.9',
        headers: { 'x-forwarded-for': '1.2.3.4' },
      });
      expect(JSON.parse(res.body).ip).toBe('203.0.113.9');
      await app.close();
    });

    it('ignores X-Forwarded-For even with multiple chained entries', async () => {
      const app = await buildTestApp();
      const res = await app.inject({
        method: 'GET',
        url: '/whoami',
        remoteAddress: '203.0.113.9',
        headers: { 'x-forwarded-for': '9.9.9.9, 8.8.8.8, 1.2.3.4' },
      });
      expect(JSON.parse(res.body).ip).toBe('203.0.113.9');
      await app.close();
    });

    it('resolves the real connection address when no forwarding header is sent at all', async () => {
      const app = await buildTestApp();
      const res = await app.inject({ method: 'GET', url: '/whoami', remoteAddress: '127.0.0.1' });
      expect(JSON.parse(res.body).ip).toBe('127.0.0.1');
      await app.close();
    });
  });

  describe('mode=hopcount (one trusted proxy)', () => {
    beforeEach(() => resetEnv({ NODE_ENV: 'test', PROXY_TRUST_MODE: 'hopcount', PROXY_TRUST_HOP_COUNT: '1' }));

    it('trusts X-Forwarded-For from the one hop nearest the server', async () => {
      const app = await buildTestApp();
      const res = await app.inject({
        method: 'GET',
        url: '/whoami',
        remoteAddress: '10.0.0.5', // the trusted proxy itself
        headers: { 'x-forwarded-for': '198.51.100.42' }, // the real client, per the proxy
      });
      expect(JSON.parse(res.body).ip).toBe('198.51.100.42');
      await app.close();
    });

    it('with multiple forwarding entries, only honors the single trusted hop and ignores anything further left', async () => {
      const app = await buildTestApp();
      // Chain: <spoofed-by-original-client>, <real-client-per-second-proxy> - with
      // hopcount:1 only the rightmost (nearest) entry is trusted.
      const res = await app.inject({
        method: 'GET',
        url: '/whoami',
        remoteAddress: '10.0.0.5',
        headers: { 'x-forwarded-for': '6.6.6.6, 198.51.100.42' },
      });
      expect(JSON.parse(res.body).ip).toBe('198.51.100.42');
      expect(JSON.parse(res.body).ip).not.toBe('6.6.6.6');
      await app.close();
    });

    it('falls back to the connection address when X-Forwarded-For is malformed/empty', async () => {
      const app = await buildTestApp();
      const res = await app.inject({
        method: 'GET',
        url: '/whoami',
        remoteAddress: '10.0.0.5',
        headers: { 'x-forwarded-for': '' },
      });
      expect(JSON.parse(res.body).ip).toBe('10.0.0.5');
      await app.close();
    });
  });

  describe('mode=hopcount (two trusted proxies)', () => {
    beforeEach(() => resetEnv({ NODE_ENV: 'test', PROXY_TRUST_MODE: 'hopcount', PROXY_TRUST_HOP_COUNT: '2' }));

    it('walks back exactly two hops through a multi-entry forwarding chain', async () => {
      const app = await buildTestApp();
      const res = await app.inject({
        method: 'GET',
        url: '/whoami',
        remoteAddress: '10.0.0.5',
        headers: { 'x-forwarded-for': '198.51.100.42, 10.0.0.4' },
      });
      expect(JSON.parse(res.body).ip).toBe('198.51.100.42');
      await app.close();
    });
  });

  describe('mode=cidr (explicit trusted proxy addresses)', () => {
    beforeEach(() =>
      resetEnv({ NODE_ENV: 'test', PROXY_TRUST_MODE: 'cidr', PROXY_TRUST_CIDRS: '10.0.0.0/24' })
    );

    it('trusts X-Forwarded-For when the immediate peer is inside the configured CIDR', async () => {
      const app = await buildTestApp();
      const res = await app.inject({
        method: 'GET',
        url: '/whoami',
        remoteAddress: '10.0.0.5',
        headers: { 'x-forwarded-for': '198.51.100.42' },
      });
      expect(JSON.parse(res.body).ip).toBe('198.51.100.42');
      await app.close();
    });

    it('ignores X-Forwarded-For when the immediate peer is an untrusted proxy outside the CIDR', async () => {
      const app = await buildTestApp();
      const res = await app.inject({
        method: 'GET',
        url: '/whoami',
        remoteAddress: '203.0.113.9', // not in 10.0.0.0/24
        headers: { 'x-forwarded-for': '198.51.100.42' },
      });
      expect(JSON.parse(res.body).ip).toBe('203.0.113.9');
      await app.close();
    });
  });

  describe('mode=azure (Container Apps ingress preset)', () => {
    beforeEach(() => resetEnv({ NODE_ENV: 'test', PROXY_TRUST_MODE: 'azure' }));

    it('behaves like a single trusted hop by default', async () => {
      const app = await buildTestApp();
      const res = await app.inject({
        method: 'GET',
        url: '/whoami',
        remoteAddress: '10.0.0.5',
        headers: { 'x-forwarded-for': '198.51.100.42' },
      });
      expect(JSON.parse(res.body).ip).toBe('198.51.100.42');
      await app.close();
    });

    it('supports a higher hop count when a CDN/Front Door sits in front of Container Apps too', async () => {
      resetEnv({ NODE_ENV: 'test', PROXY_TRUST_MODE: 'azure', PROXY_TRUST_HOP_COUNT: '2' });
      const app = await buildTestApp();
      const res = await app.inject({
        method: 'GET',
        url: '/whoami',
        remoteAddress: '10.0.0.5',
        headers: { 'x-forwarded-for': '198.51.100.42, 10.0.0.4' },
      });
      expect(JSON.parse(res.body).ip).toBe('198.51.100.42');
      await app.close();
    });
  });
});
