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
    host: env.redis.host,
    port: env.redis.port,
    password: env.redis.password,
    db: env.redis.db,
    // Managed Redis (e.g. Azure Cache for Redis) rejects plaintext connections outright
    ...(env.redis.tls ? { tls: { servername: env.redis.host } } : {}),
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
  const requestId = (request as any).requestId;
  const ip = getClientIp(request);
  const user = (request as any).user;

  // Log rate limit event for monitoring
  logger.warn(
    {
      requestId,
      ip,
      url: request.url,
      retryAfter,
    },
    'Rate limit exceeded'
  );

  // Log to audit service if available
  const auditService = (request.server as any).audit;
  if (auditService) {
    auditService.logRateLimitExceeded({
      userId: user?.userId,
      ip,
      requestId,
      resource: request.url,
    }).catch((err: any) => {
      // Don't fail the request if audit logging fails
      logger.error({ error: err }, 'Failed to log rate limit to audit service');
    });
  }

  return {
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests, please try again later',
    },
    requestId,
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
    max: env.rateLimit.globalMax,
    timeWindow: env.rateLimit.globalWindowMs,
    redis,
    keyGenerator: keyGenerators.byIp,
    errorResponseBuilder: rateLimitErrorHandler,
    enableDraftSpec: true, // Emits IETF draft-spec "RateLimit-*" headers
  });

  // @fastify/rate-limit's addHeaders/addHeadersOnExceeding options are keyed by the
  // *active* label set - with enableDraftSpec on, that's "ratelimit-*", so those options
  // can't also produce the legacy "X-RateLimit-*" headers. Mirror them here instead, since
  // some API clients still only look for the legacy names.
  app.addHook('onSend', async (request, reply, payload) => {
    const limit = reply.getHeader('ratelimit-limit');
    if (limit !== undefined) {
      reply.header('x-ratelimit-limit', limit);
      reply.header('x-ratelimit-remaining', reply.getHeader('ratelimit-remaining'));

      // The draft-spec "ratelimit-reset" header is a delta in seconds-until-reset;
      // the legacy "X-RateLimit-Reset" convention is an absolute Unix timestamp
      const resetDeltaSeconds = Number(reply.getHeader('ratelimit-reset'));
      if (Number.isFinite(resetDeltaSeconds)) {
        reply.header('x-ratelimit-reset', Math.floor(Date.now() / 1000) + resetDeltaSeconds);
      }
    }
    return payload;
  });
}

/**
 * Create a Redis-backed, fixed-window route rate limiter.
 * Use this for stricter limits on sensitive endpoints (auth, per-user quotas, etc).
 * Unlike an in-memory Map, this is correct across multiple gateway instances since
 * every instance increments the same Redis counter.
 *
 * @param redis - Shared Redis client
 * @param max - Maximum requests per window
 * @param timeWindowMs - Time window in milliseconds
 * @param keyGenerator - Optional custom key generator
 * @returns Fastify preHandler hook
 *
 * @example
 * app.post('/auth/login', {
 *   preHandler: createRateLimiter(redis, 5, 60000) // 5 requests per minute
 * }, handler);
 */
export function createRateLimiter(
  redis: Redis,
  max: number,
  timeWindowMs: number,
  keyGenerator: (request: FastifyRequest) => string = keyGenerators.byIp
) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const key = `ratelimit:route:${keyGenerator(request)}:${request.routeOptions.url ?? request.url}`;

    // Atomic fixed-window counter: increment, and set the window's expiry only
    // on the first hit so concurrent requests can't each reset the window.
    const count = await redis.incr(key);
    if (count === 1) {
      await redis.pexpire(key, timeWindowMs);
    }
    const ttl = await redis.pttl(key);
    const effectiveTtl = ttl > 0 ? ttl : timeWindowMs;

    addRateLimitHeaders(reply, {
      max,
      current: count,
      ttl: effectiveTtl,
    });

    if (count > max) {
      const retryAfter = Math.ceil(effectiveTtl / 1000);
      const requestId = (request as any).requestId;
      const ip = getClientIp(request);
      const user = (request as any).user;

      logger.warn(
        {
          requestId,
          ip,
          url: request.url,
          retryAfter,
        },
        'Rate limit exceeded (route-specific)'
      );

      // Log to audit service if available
      const auditService = (request.server as any).audit;
      if (auditService) {
        auditService.logRateLimitExceeded({
          userId: user?.userId,
          ip,
          requestId,
          resource: request.url,
        }).catch((err: any) => {
          // Don't fail the request if audit logging fails
          logger.error({ error: err }, 'Failed to log rate limit to audit service');
        });
      }

      throw new RateLimitError(retryAfter, 'Too many requests, please try again later');
    }
  };
}

/**
 * Export key generators for reuse
 */
export { keyGenerators };
