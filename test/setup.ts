/**
 * Test setup and global configuration
 */

import Redis from 'ioredis';

// Set test environment
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent'; // Suppress logs during tests
process.env.REDIS_HOST = 'localhost';
process.env.REDIS_PORT = '6379';
// Jest runs test *files* concurrently across worker processes, and several suites spin up
// a real app (real Redis-backed rate limiting/token storage). Without per-worker isolation,
// two files racing against the same Redis DB corrupt each other's rate-limit/lockout counters.
// JEST_WORKER_ID is stable for a worker's lifetime, so derive a dedicated DB (1-14) from it -
// tests that construct their own Redis client directly should reuse process.env.REDIS_DB too.
process.env.REDIS_DB = String(1 + (Number(process.env.JEST_WORKER_ID || '0') % 14));
process.env.JWT_ALGORITHM = 'HS256';
process.env.JWT_SECRET = 'test-secret-key-for-testing-only-min-256-bits-long-xxxxx';
process.env.COOKIE_SECRET = 'test-cookie-secret-min-32-chars-long';
process.env.CORS_ORIGIN = 'http://localhost:3000';
process.env.ENABLE_SWAGGER = 'false';
process.env.UPSTREAM_REPORTS_URL = 'http://localhost:4000';

// Set reasonable test timeouts
jest.setTimeout(10000);

// Start every test *file* from a clean slate on its assigned Redis DB. Rate-limit counters
// and account lockouts are real Redis state (by design - that's what makes them correct
// across multiple gateway instances), so without this, failed-login/rate-limit assertions
// in one run can leak into the next and produce flaky, state-dependent failures.
beforeAll(async () => {
  const redis = new Redis({
    host: process.env.REDIS_HOST,
    port: Number(process.env.REDIS_PORT),
    db: Number(process.env.REDIS_DB),
    lazyConnect: true,
    maxRetriesPerRequest: 1,
  });

  try {
    await redis.connect();
    await redis.flushdb();
  } finally {
    redis.disconnect();
  }
});
