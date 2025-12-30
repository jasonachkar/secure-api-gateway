/**
 * Authentication routes
 * Defines auth endpoints with validation and rate limiting
 */

import { FastifyInstance } from 'fastify';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { loginSchema, type LoginRequest } from './auth.schemas.js';
import { validate } from '../../middleware/validation.js';
import { createRateLimiter } from '../../middleware/rateLimit.js';
import { env } from '../../config/index.js';
import Redis from 'ioredis';

/**
 * Register authentication routes
 */
export async function registerAuthRoutes(app: FastifyInstance, redis: Redis) {
  // Initialize auth service
  const authService = new AuthService(redis);
  await authService.initialize();

  const controller = new AuthController(authService);

  // Stricter rate limit for auth endpoints (prevent brute force)
  const authRateLimit = createRateLimiter(
    env.RATE_LIMIT_AUTH_MAX,
    env.RATE_LIMIT_AUTH_WINDOW
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
    },
    controller.logout.bind(controller)
  );
}
