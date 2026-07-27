/**
 * Authentication routes
 * Defines auth endpoints with validation and rate limiting
 */

import { FastifyInstance } from 'fastify';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { AuditService } from '../audit/audit.service.js';
import { loginSchema, type LoginRequest } from './auth.schemas.js';
import { validate } from '../../middleware/validation.js';
import { optionalAuth } from '../../middleware/auth.js';
import { createRateLimiter } from '../../middleware/rateLimit.js';
import { env } from '../../config/index.js';
import Redis from 'ioredis';
import type { AuthSecurityPipeline } from './auth.controller.js';

/**
 * Register authentication routes
 */
export async function registerAuthRoutes(
  app: FastifyInstance,
  redis: Redis,
  auditService: AuditService,
  securityPipeline?: AuthSecurityPipeline
): Promise<AuthService> {
  // Initialize auth service
  const authService = new AuthService(redis);
  await authService.initialize();

  const controller = new AuthController(authService, auditService, securityPipeline);

  // Stricter rate limit for auth endpoints (prevent brute force)
  const authRateLimit = createRateLimiter(
    redis,
    env.rateLimit.authMax,
    env.rateLimit.authWindowMs
  );

  /**
   * POST /auth/login
   * Authenticate user with username/password
   */
  app.post<{ Body: LoginRequest }>(
    '/auth/login',
    {
      schema: {
        description: 'Authenticate user and obtain access token',
        tags: ['Authentication'],
        body: {
          type: 'object',
          required: ['username', 'password'],
          properties: {
            username: {
              type: 'string',
              minLength: 3,
              maxLength: 50,
              pattern: '^[a-zA-Z0-9_-]+$',
            },
            password: {
              type: 'string',
              minLength: 8,
              maxLength: 128,
            },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              accessToken: { type: 'string' },
              expiresIn: { type: 'number' },
              tokenType: { type: 'string', enum: ['Bearer'] },
            },
          },
        },
      },
      preHandler: [authRateLimit, validate(loginSchema, 'body')],
    },
    controller.login.bind(controller)
  );

  /**
   * POST /auth/demo-login
   * One-click read-only reviewer login (no credentials required from the caller).
   * Shares the auth rate limiter so it can't be used to bypass brute-force protection.
   */
  app.post(
    '/auth/demo-login',
    {
      schema: {
        description: 'One-click read-only reviewer login',
        tags: ['Authentication'],
        response: {
          200: {
            type: 'object',
            properties: {
              accessToken: { type: 'string' },
              expiresIn: { type: 'number' },
              tokenType: { type: 'string', enum: ['Bearer'] },
            },
          },
        },
      },
      config: {
        rateLimit: {
          max: env.rateLimit.authMax,
          timeWindow: env.rateLimit.authWindowMs,
        },
      },
      preHandler: [authRateLimit],
    },
    controller.demoLogin.bind(controller)
  );

  /**
   * POST /auth/refresh
   * Refresh access token using refresh token cookie
   */
  app.post(
    '/auth/refresh',
    {
      schema: {
        description: 'Refresh access token',
        tags: ['Authentication'],
        response: {
          200: {
            type: 'object',
            properties: {
              accessToken: { type: 'string' },
              expiresIn: { type: 'number' },
              tokenType: { type: 'string', enum: ['Bearer'] },
            },
          },
        },
      },
      preHandler: [authRateLimit],
    },
    controller.refresh.bind(controller)
  );

  /**
   * POST /auth/logout
   * Logout user and revoke refresh token
   */
  app.post(
    '/auth/logout',
    {
      schema: {
        description: 'Logout user and revoke refresh token',
        tags: ['Authentication'],
        response: {
          200: {
            type: 'object',
            properties: {
              message: { type: 'string' },
            },
          },
        },
      },
      // Best-effort: attach the user if a still-valid access token is
      // present so its jti can be revoked too, but don't require one -
      // logout must also work once the access token has already expired
      preHandler: [authRateLimit, optionalAuth],
    },
    controller.logout.bind(controller)
  );

  return authService;
}
