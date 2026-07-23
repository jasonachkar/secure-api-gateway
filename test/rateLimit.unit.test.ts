/**
 * Rate Limit Middleware Unit Tests
 * Covers the Redis-backed route limiter (createRateLimiter) directly, including that
 * per-user and per-IP key generators isolate their buckets from one another.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import Redis from 'ioredis';
import { createRateLimiter, keyGenerators } from '../src/middleware/rateLimit.js';
import { RateLimitError } from '../src/lib/errors.js';

function makeRequest(overrides: Record<string, unknown> = {}): any {
  return {
    headers: {},
    ip: '203.0.113.10',
    url: '/reports/abc',
    routeOptions: { url: '/reports/abc' },
    server: {},
    ...overrides,
  };
}

function makeReply(): any {
  const headers: Record<string, unknown> = {};
  return {
    header: (name: string, value: unknown) => {
      headers[name] = value;
    },
    getHeaders: () => headers,
  };
}

describe('Redis-backed route rate limiter', () => {
  let redis: Redis;

  beforeEach(() => {
    redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      db: parseInt(process.env.REDIS_DB || '0', 10), // Per-worker DB, set in test/setup.ts
    });
  });

  afterEach(async () => {
    await redis.flushdb();
    await redis.quit();
  });

  it('allows requests under the limit and blocks once exceeded', async () => {
    const limiter = createRateLimiter(redis, 3, 60000);
    const request = makeRequest();
    const reply = makeReply();

    await limiter(request, reply);
    await limiter(request, reply);
    await limiter(request, reply);

    await expect(limiter(request, reply)).rejects.toThrow(RateLimitError);
  });

  it('sets rate limit headers on each request', async () => {
    const limiter = createRateLimiter(redis, 5, 60000);
    const request = makeRequest();
    const reply = makeReply();

    await limiter(request, reply);
    const headers = reply.getHeaders();

    expect(Number(headers['RateLimit-Limit'])).toBe(5);
    expect(Number(headers['RateLimit-Remaining'])).toBe(3); // max(0, 5 - 1 - 1)
    expect(headers['RateLimit-Reset']).toBeDefined();
  });

  it('gives distinct buckets to distinct users under keyGenerators.byUser', async () => {
    const limiter = createRateLimiter(redis, 1, 60000, keyGenerators.byUser);

    const alice = makeRequest({ user: { userId: 'user-alice' } });
    const bob = makeRequest({ user: { userId: 'user-bob' } });
    const reply = makeReply();

    // Each user gets their own single-request allowance
    await limiter(alice, reply);
    await limiter(bob, reply);

    // But a second request from the same user is blocked
    await expect(limiter(alice, reply)).rejects.toThrow(RateLimitError);
    await expect(limiter(bob, reply)).rejects.toThrow(RateLimitError);
  });

  it('falls back to IP-based bucketing for unauthenticated requests under byUser', async () => {
    const limiter = createRateLimiter(redis, 1, 60000, keyGenerators.byUser);
    const request = makeRequest(); // no `user` attached

    const reply = makeReply();
    await limiter(request, reply);

    await expect(limiter(request, reply)).rejects.toThrow(RateLimitError);
  });

  it('is correct across independent limiter instances sharing the same Redis key (multi-instance simulation)', async () => {
    // Two "gateway instances" pointed at the same Redis - simulates horizontal scaling
    const limiterA = createRateLimiter(redis, 2, 60000);
    const limiterB = createRateLimiter(redis, 2, 60000);
    const request = makeRequest();
    const reply = makeReply();

    await limiterA(request, reply); // count = 1
    await limiterB(request, reply); // count = 2 (shared Redis key)

    await expect(limiterA(request, reply)).rejects.toThrow(RateLimitError);
  });
});
