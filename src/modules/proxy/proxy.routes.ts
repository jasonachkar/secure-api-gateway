/**
 * Proxy routes
 * Demonstrates gateway pattern with upstream proxying
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import Redis from 'ioredis';
import { ProxyService } from './proxy.service.js';
import { optionalAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validation.js';
import { createRateLimiter, keyGenerators } from '../../middleware/rateLimit.js';
import { createOptionalApiKeyAuth, requireApiKeyScope } from '../apikeys/apikey.middleware.js';
import { env } from '../../config/index.js';
import { z } from 'zod';

/**
 * Query schema for echo endpoint
 */
const echoQuerySchema = z.object({
  message: z.string().min(1).max(1000),
});

type EchoQuery = z.infer<typeof echoQuerySchema>;

/**
 * Register proxy routes
 */
export async function registerProxyRoutes(app: FastifyInstance, redis: Redis) {
  const service = new ProxyService();

  // Per-user (or per-IP, if unauthenticated) quota on top of the global limit
  const userRateLimit = createRateLimiter(
    redis,
    env.rateLimit.userMax,
    env.rateLimit.userWindowMs,
    keyGenerators.byUser
  );

  // API-key quota is tracked separately from user/IP quotas so a machine client
  // with its own key doesn't compete with interactive users for the same bucket
  const apiKeyRateLimit = createRateLimiter(
    redis,
    env.rateLimit.apiKeyMax,
    env.rateLimit.apiKeyWindowMs,
    (request) => {
      const apiKey = (request as any).apiKey;
      return apiKey ? `ratelimit:apikey:${apiKey.id}` : keyGenerators.byUser(request);
    }
  );

  const optionalApiKeyAuth = createOptionalApiKeyAuth(app.apiKeyStore);

  // Route to the matching quota, and only enforce the API key scope when a key was
  // actually used - JWT/anonymous callers never carry (or need) API key scopes
  async function proxyRateLimit(request: FastifyRequest, reply: FastifyReply) {
    if ((request as any).apiKey) {
      await apiKeyRateLimit(request, reply);
    } else {
      await userRateLimit(request, reply);
    }
  }

  async function requireProxyScopeIfApiKey(request: FastifyRequest) {
    if ((request as any).apiKey) {
      await requireApiKeyScope('proxy:access')(request);
    }
  }

  /**
   * GET /upstream/echo
   * Echo endpoint (demonstrates upstream proxying with SSRF protection).
   * Accepts either a JWT (optional) or a scoped API key with "proxy:access".
   */
  app.get<{ Querystring: EchoQuery }>(
    '/upstream/echo',
    {
      schema: {
        description: 'Echo service (proxied to upstream). Accepts a JWT or an API key with the "proxy:access" scope.',
        tags: ['Proxy'],
        querystring: {
          type: 'object',
          required: ['message'],
          properties: {
            message: { type: 'string', minLength: 1, maxLength: 1000 },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              message: { type: 'string' },
              timestamp: { type: 'number' },
            },
          },
        },
      },
      preHandler: [
        optionalApiKeyAuth,
        optionalAuth,
        proxyRateLimit,
        requireProxyScopeIfApiKey,
        validate(echoQuerySchema, 'query'),
      ],
    },
    async (request: FastifyRequest<{ Querystring: EchoQuery }>) => {
      const { message } = request.query;
      return service.echo(message);
    }
  );
}
