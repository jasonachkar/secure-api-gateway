/**
 * HTTP Client Unit Tests
 * Covers SSRF protection (allowlist + private-IP + DNS pinning) and the circuit breaker
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

// `mock-service` is in the default ALLOWED_UPSTREAM_HOSTS allowlist (see src/config/env.ts)
const ALLOWED_HOST = 'mock-service';
const ALLOWED_URL = `http://${ALLOWED_HOST}/echo`;
const DISALLOWED_URL = 'http://evil.example.com/echo';

jest.mock('dns/promises', () => ({
  __esModule: true,
  default: {
    resolve4: jest.fn(),
    resolve6: jest.fn(),
  },
}));

describe('httpClient - SSRF protection and circuit breaker', () => {
  let dns: { resolve4: jest.Mock; resolve6: jest.Mock };
  let fetchSpy: jest.SpiedFunction<typeof fetch>;
  // Loaded fresh (via jest.resetModules + require, not a dynamic import - Jest's default
  // CJS transform can't execute a real dynamic `import()` without --experimental-vm-modules)
  // so each test gets its own module-level circuit breaker state.
  let httpClient: typeof import('../src/lib/httpClient.js');

  beforeEach(() => {
    jest.resetModules();

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    dns = require('dns/promises').default;
    dns.resolve4.mockReset();
    dns.resolve6.mockReset();
    // A public-looking IP - never actually dialed since fetch itself is mocked below
    dns.resolve4.mockResolvedValue(['93.184.216.34']);

    fetchSpy = jest.spyOn(global, 'fetch') as any;

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    httpClient = require('../src/lib/httpClient.js');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('rejects hosts not in the allowlist without ever calling fetch', async () => {
    await expect(httpClient.httpGet(DISALLOWED_URL)).rejects.toThrow(/not allowed/i);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('rejects hosts that resolve to a private IP', async () => {
    dns.resolve4.mockResolvedValue(['10.0.0.5']);

    await expect(httpClient.httpGet(ALLOWED_URL)).rejects.toThrow(/private IP/i);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('pins the connection to the validated IP instead of letting fetch re-resolve DNS', async () => {
    fetchSpy.mockImplementation(async (_url, init: any) => {
      // The dispatcher's custom lookup is what closes the DNS-rebinding TOCTOU gap -
      // assert it was actually attached to the outbound request.
      expect(init?.dispatcher).toBeDefined();
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });

    const result = await httpClient.httpGet(ALLOWED_URL);

    expect(result.status).toBe(200);
    expect(dns.resolve4).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('allows a private IP only when SSRF_ALLOW_PRIVATE_IPS=true (the Docker Compose escape hatch)', async () => {
    process.env.SSRF_ALLOW_PRIVATE_IPS = 'true';
    try {
      // The flag is read once at module load, so this needs a fresh module graph -
      // which also resets the dns/promises mock, so it has to be reconfigured too.
      jest.resetModules();
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const freshDns: { resolve4: jest.Mock } = require('dns/promises').default;
      freshDns.resolve4.mockResolvedValue(['172.18.0.3']); // a Docker-network-style private IP

      fetchSpy.mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } })
      );

      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const bypassedClient: typeof import('../src/lib/httpClient.js') = require('../src/lib/httpClient.js');
      const result = await bypassedClient.httpGet(ALLOWED_URL);
      expect(result.status).toBe(200);
    } finally {
      delete process.env.SSRF_ALLOW_PRIVATE_IPS;
    }
  });

  it('trips the circuit breaker after repeated failures and short-circuits further calls', async () => {
    fetchSpy.mockRejectedValue(new Error('connection refused'));

    // Default failure threshold is 5 (CIRCUIT_BREAKER_FAILURE_THRESHOLD); exhaust it
    for (let i = 0; i < 5; i++) {
      await expect(httpClient.httpGet(ALLOWED_URL, { retries: 0, timeout: 500 })).rejects.toThrow();
    }

    const callsBeforeOpen = fetchSpy.mock.calls.length;

    // The circuit should now be open - this call must fail fast, without touching fetch again
    await expect(httpClient.httpGet(ALLOWED_URL, { retries: 0, timeout: 500 })).rejects.toThrow(/circuit open/i);
    expect(fetchSpy.mock.calls.length).toBe(callsBeforeOpen);
  });
});
