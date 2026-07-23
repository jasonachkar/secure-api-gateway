/**
 * Environment Config Validation Unit Tests
 * Covers the production fail-fast rules in src/config/env.ts (superRefine) - this is
 * security-critical (it's what actually stops the app booting with a placeholder
 * secret, an unauthenticated Redis, a wildcard CORS origin, Swagger left on, or the
 * SSRF private-IP bypass enabled) but had no dedicated test coverage before this.
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

const BASE_PROD_ENV: Record<string, string> = {
  NODE_ENV: 'production',
  REDIS_HOST: 'redis.internal',
  REDIS_PASSWORD: 'a-real-redis-password',
  JWT_ALGORITHM: 'HS256',
  JWT_SECRET: 'a-genuinely-random-64-character-secret-not-a-placeholder-value-xyz',
  COOKIE_SECRET: 'a-genuinely-random-32-plus-character-cookie-secret-value',
  CORS_ORIGIN: 'https://dashboard.example.com',
  ENABLE_SWAGGER: 'false',
};

describe('env.ts production fail-fast validation', () => {
  const originalEnv = { ...process.env };
  let exitSpy: jest.SpiedFunction<typeof process.exit>;
  let errorSpy: jest.SpiedFunction<typeof console.error>;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    exitSpy = jest.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`process.exit(${code})`);
    }) as any);
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    process.env = originalEnv;
    exitSpy.mockRestore();
    errorSpy.mockRestore();
  });

  function loadEnvWith(overrides: Record<string, string | undefined>) {
    Object.assign(process.env, BASE_PROD_ENV, overrides);
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return () => require('../src/config/env.js');
  }

  it('boots successfully with a fully valid production config', () => {
    const load = loadEnvWith({});
    expect(load).not.toThrow();
  });

  it('refuses a known placeholder COOKIE_SECRET in production', () => {
    const load = loadEnvWith({ COOKIE_SECRET: 'your-cookie-secret-min-32-chars-long-change-in-production' });
    expect(load).toThrow(/process\.exit/);
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('refuses a known placeholder JWT_SECRET in production', () => {
    const load = loadEnvWith({ JWT_SECRET: 'your-super-secret-key-min-256-bits-long-change-me' });
    expect(load).toThrow(/process\.exit/);
  });

  it('refuses a missing REDIS_PASSWORD in production', () => {
    const load = loadEnvWith({ REDIS_PASSWORD: '' });
    expect(load).toThrow(/process\.exit/);
  });

  it('refuses a wildcard CORS_ORIGIN in production', () => {
    const load = loadEnvWith({ CORS_ORIGIN: '*' });
    expect(load).toThrow(/process\.exit/);
  });

  it('refuses ENABLE_SWAGGER=true in production', () => {
    const load = loadEnvWith({ ENABLE_SWAGGER: 'true' });
    expect(load).toThrow(/process\.exit/);
  });

  it('refuses SSRF_ALLOW_PRIVATE_IPS=true in production (Docker Compose escape hatch only)', () => {
    const load = loadEnvWith({ SSRF_ALLOW_PRIVATE_IPS: 'true' });
    expect(load).toThrow(/process\.exit/);
  });

  it('does not apply any of the above restrictions outside production', () => {
    const load = () => {
      Object.assign(process.env, BASE_PROD_ENV, {
        NODE_ENV: 'development',
        COOKIE_SECRET: 'your-cookie-secret-min-32-chars-long-change-in-production',
        CORS_ORIGIN: '*',
        ENABLE_SWAGGER: 'true',
        SSRF_ALLOW_PRIVATE_IPS: 'true',
        REDIS_PASSWORD: '',
      });
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      return require('../src/config/env.js');
    };

    expect(load).not.toThrow();
  });
});
