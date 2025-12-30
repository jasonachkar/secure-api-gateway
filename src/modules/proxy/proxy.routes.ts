/**
 * Proxy routes
 * Demonstrates gateway pattern with upstream proxying
 */

import { FastifyInstance, FastifyRequest } from 'fastify';
import { ProxyService } from './proxy.service.js';
import { echoRequestSchema, EchoRequest } from './proxy.schemas.js';
import { optionalAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validation.js';
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
export async function registerProxyRoutes(app: FastifyInstance) {
  const service = new ProxyService();

  /**
   * GET /upstream/echo
   * Echo endpoint (demonstrates upstream proxying with SSRF protection)
   */
  app.get<{ Querystring: EchoQuery }>(
    '/upstream/echo',
    {
      schema: {
        description: 'Echo service (proxied to upstream)',
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
      preHandler: [optionalAuth, validate(echoQuerySchema, 'query')],
    },
    async (request: FastifyRequest<{ Querystring: EchoQuery }>) => {
      const { message } = request.query;
      return service.echo(message);
    }
  );
}
