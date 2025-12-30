/**
 * Redis-backed rate limiting middleware
 * Implements sliding window rate limiting with per-IP, per-user, and per-route limits
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import Redis from 'ioredis';
import { env } from '../config/index.js';
import { RateLimitError } from '../lib/errors.js';
import { getClientIp } from '../lib/requestContext.js';
import { logger } from '../lib/logger.js';

/**
 * Create Redis client for rate limiting
 */
export function createRedisClient(): Redis {
  const redis = new Redis({
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    password: env.REDIS_PASSWORD,
    db: env.REDIS_DB,
    retryStrategy: (times: number) => {
      const delay = Math.min(times * 50, 2000);
      return delay;
    },
    maxRetriesPerRequest: 3,
  });

  redis.on('error', (error) => {
    logger.error({ error }, 'Redis connection error');
  });

  redis.on('connect', () => {
    logger.info('Redis connected for rate limiting');
  });

  return redis;
}

/**
 * Rate limit key generators
 */
const keyGenerators = {
  /**
   * Global rate limit by IP
   */
  byIp: (request: FastifyRequest): string => {
    const ip = getClientIp(request);
    return `ratelimit:global:${ip}`;
  },

  /**
   * Per-user rate limit (requires authentication)
   */
  byUser: (request: FastifyRequest): string => {
    const user = (request as any).user;
    if (user?.userId) {
      return `ratelimit:user:${user.userId}`;
    }
    // Fallback to IP if not authenticated
    return keyGenerators.byIp(request);
  },

  /**
   * Per-route rate limit by IP
   */
  byRoute: (route: string) => (request: FastifyRequest): string => {
    const ip = getClientIp(request);
    return `ratelimit:route:${route}:${ip}`;
  },
};

/**
 * Rate limit error handler
 * Returns 429 with retry-after header
 */
function rateLimitErrorHandler(request: FastifyRequest, context: any): object {
  const retryAfter = Math.ceil(context.ttl / 1000); // Convert ms to seconds

  // Log rate limit event for monitoring
  logger.warn(
    {
      requestId: (request as any).requestId,
      ip: getClientIp(request),
      url: request.url,
      retryAfter,
    },
    'Rate limit exceeded'
  );

  return {
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests, please try again later',
    },
    requestId: (request as any).requestId,
  };
}

/**
 * Add rate limit headers to response
 * Following standard rate limit header format
 */
function addRateLimitHeaders(reply: FastifyReply, context: any) {
  reply.header('RateLimit-Limit', context.max);
  reply.header('RateLimit-Remaining', Math.max(0, context.max - context.current - 1));
  reply.header('RateLimit-Reset', new Date(Date.now() + context.ttl).toISOString());

  // Also add legacy X-RateLimit headers for compatibility
  reply.header('X-RateLimit-Limit', context.max);
  reply.header('X-RateLimit-Remaining', Math.max(0, context.max - context.current - 1));
  reply.header('X-RateLimit-Reset', Math.ceil((Date.now() + context.ttl) / 1000));
}

/**
 * Register global rate limiting
 * Applied to all routes by default
 */
export async function registerGlobalRateLimit(app: FastifyInstance, redis: Redis) {
  await app.register(rateLimit, {
    max: env.RATE_LIMIT_GLOBAL_MAX,
    timeWindow: env.RATE_LIMIT_GLOBAL_WINDOW,
    redis,
    keyGenerator: keyGenerators.byIp,
    errorResponseBuilder: rateLimitErrorHandler,
    enableDraftSpec: true, // Enable standard rate limit headers
    addHeadersOnExceeding: {
      'x-ratelimit-limit': true,
      'x-ratelimit-remaining': true,
      'x-ratelimit-reset': true,
    },
    addHeaders: {
      'x-ratelimit-limit': true,
      'x-ratelimit-remaining': true,
      'x-ratelimit-reset': true,
      'retry-after': true,
    },
  });

  // Add hook to include standard rate limit headers
  app.addHook('onSend', async (request, reply) => {
    // Headers are already added by @fastify/rate-limit
    // This hook is here for custom header additions if needed
  });
}

/**
 * Create route-specific rate limiter
 * Use this for stricter limits on sensitive endpoints
 *
 * @param max - Maximum requests
 * @param timeWindow - Time window in milliseconds
 * @param keyGenerator - Optional custom key generator
 * @returns Fastify preHandler hook
 *
 * @example
 * app.post('/auth/login', {
 *   preHandler: createRateLimiter(5, 60000) // 5 requests per minute
 * }, handler);
 */
export function createRateLimiter(
  max: number,
  timeWindow: number,
  keyGenerator: (request: FastifyRequest) => string = keyGenerators.byIp
) {
  // Store for rate limit data (in-memory fallback if Redis unavailable)
  const store = new Map<string, { count: number; resetTime: number }>();

  return async (request: FastifyRequest, reply: FastifyReply) => {
    const key = keyGenerator(request);
    const now = Date.now();

    // Get or create rate limit entry
    let entry = store.get(key);

    // Reset if window expired
    if (!entry || now > entry.resetTime) {
      entry = { count: 0, resetTime: now + timeWindow };
      store.set(key, entry);
    }

    // Increment counter
    entry.count++;

    // Calculate remaining and TTL
    const remaining = Math.max(0, max - entry.count);
    const ttl = entry.resetTime - now;

    // Add headers
    addRateLimitHeaders(reply, {
      max,
      current: entry.count,
      ttl,
    });

    // Check if limit exceeded
    if (entry.count > max) {
      const retryAfter = Math.ceil(ttl / 1000);

      logger.warn(
        {
          requestId: (request as any).requestId,
          ip: getClientIp(request),
          url: request.url,
          retryAfter,
        },
        'Rate limit exceeded (route-specific)'
      );

      throw new RateLimitError(retryAfter, 'Too many requests, please try again later');
    }

    // Cleanup expired entries periodically (simple approach)
    if (Math.random() < 0.01) {
      // 1% chance
      for (const [k, v] of store.entries()) {
        if (now > v.resetTime) {
          store.delete(k);
        }
      }
    }
  };
}

/**
 * Export key generators for reuse
 */
export { keyGenerators };
