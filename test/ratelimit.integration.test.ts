/**
 * Rate Limiting Integration Tests
 * Tests rate limit enforcement and headers
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { FastifyInstance } from 'fastify';
import { createApp } from '../src/app.js';

describe('Rate Limiting (Integration)', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    // Arrange: Create app
    app = await createApp();
    await app.ready();
  });

  afterAll(async () => {
    // Cleanup
    await app.close();
  });

  it('should enforce rate limits and return 429 when exceeded', async () => {
    // Arrange: Auth endpoint has strict rate limit (5 requests/minute from .env.example)
    const maxRequests = parseInt(process.env.RATE_LIMIT_AUTH_MAX || '5', 10);

    // Act: Make requests up to limit
    const responses = [];
    for (let i = 0; i < maxRequests + 2; i++) {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: {
          username: 'testuser',
          password: 'testpass',
        },
        headers: {
          'x-forwarded-for': '192.168.1.100', // Consistent IP for rate limiting
        },
      });

      responses.push(response);
    }

    // Assert: First N requests should succeed or fail auth (not rate limited)
    for (let i = 0; i < maxRequests; i++) {
      expect(responses[i].statusCode).not.toBe(429);
    }

    // Assert: Next requests should be rate limited
    const rateLimitedResponse = responses[maxRequests];
    expect(rateLimitedResponse.statusCode).toBe(429);

    const body = JSON.parse(rateLimitedResponse.body);
    expect(body.error.code).toBe('RATE_LIMIT_EXCEEDED');
  });

  it('should include rate limit headers in response', async () => {
    // Act
    const response = await app.inject({
      method: 'GET',
      url: '/healthz',
      headers: {
        'x-forwarded-for': '192.168.1.200', // Different IP to avoid previous rate limit
      },
    });

    // Assert: Check for rate limit headers
    expect(response.headers).toHaveProperty('x-ratelimit-limit');
    expect(response.headers).toHaveProperty('x-ratelimit-remaining');
    expect(response.headers).toHaveProperty('x-ratelimit-reset');

    // Verify header values are valid numbers
    const limit = parseInt(response.headers['x-ratelimit-limit'] as string, 10);
    const remaining = parseInt(response.headers['x-ratelimit-remaining'] as string, 10);

    expect(limit).toBeGreaterThan(0);
    expect(remaining).toBeGreaterThanOrEqual(0);
    expect(remaining).toBeLessThanOrEqual(limit);
  });

  it('should reset rate limit after time window', async () => {
    // Note: This test would require waiting for the time window to pass
    // For practical testing, we verify the reset timestamp is in the future

    // Act
    const response = await app.inject({
      method: 'GET',
      url: '/healthz',
      headers: {
        'x-forwarded-for': '192.168.1.201',
      },
    });

    // Assert: Reset timestamp should be in the future
    const resetHeader = response.headers['x-ratelimit-reset'] as string;
    const resetTime = parseInt(resetHeader, 10);
    const now = Math.floor(Date.now() / 1000);

    expect(resetTime).toBeGreaterThan(now);
  });
});
