/**
 * Fastify application setup
 * Configures all plugins, middleware, and routes
 */

import Fastify, { FastifyInstance, FastifyError, FastifyRequest, FastifyReply } from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import compress from '@fastify/compress';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { env } from './config/index.js';
import { logger } from './lib/logger.js';
import { AppError, isOperationalError } from './lib/errors.js';
import { requestIdHook } from './middleware/requestId.js';
import { registerSecurityHeaders } from './middleware/securityHeaders.js';
import { registerGlobalRateLimit, createRedisClient } from './middleware/rateLimit.js';
import { registerAuthRoutes } from './modules/auth/auth.routes.js';
import { registerAuditRoutes } from './modules/audit/audit.routes.js';
import { registerReportsRoutes } from './modules/reports/reports.routes.js';
import { registerProxyRoutes } from './modules/proxy/proxy.routes.js';
import { registerAdminRoutes } from './modules/admin/admin.routes.js';
import { AuditService } from './modules/audit/audit.service.js';
import { createAuditStore } from './modules/audit/audit.store.js';
import { MetricsService } from './modules/admin/metrics.service.js';
import { registerMetricsCollection } from './middleware/metrics.js';
import { getRequestDuration } from './lib/requestContext.js';

/**
 * Create and configure Fastify application
 */
export async function createApp(): Promise<FastifyInstance> {
  // Create Fastify instance with logger
  const app = Fastify({
    loggerInstance: logger,
    bodyLimit: env.BODY_LIMIT,
    requestTimeout: env.REQUEST_TIMEOUT,
    trustProxy: true, // Trust X-Forwarded-* headers from proxy
    disableRequestLogging: true, // We use custom request logging
  });

  // Initialize Redis for rate limiting and token storage
  const redis = createRedisClient();

  // Initialize audit service
  const auditStore = createAuditStore(env.isProduction ? redis : undefined);
  const auditService = new AuditService(auditStore);
  await auditService.initialize();

  // Initialize metrics service
  const metricsService = new MetricsService(redis);

  // Decorate app with services for use in routes
  app.decorate('audit', auditService);
  app.decorate('metrics', metricsService);

  // ============================================
  // PLUGINS
  // ============================================

  // Cookie parser (for refresh tokens)
  await app.register(cookie, {
    secret: env.COOKIE_SECRET,
    parseOptions: {
      httpOnly: true,
      secure: env.isProduction,
      sameSite: 'strict',
    },
  });

  // CORS
  await app.register(cors, {
    origin: env.CORS_ORIGIN,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
    exposedHeaders: ['X-Request-ID', 'RateLimit-*'],
  });

  // Compression
  await app.register(compress, {
    global: true,
    threshold: 1024, // Only compress responses > 1KB
  });

  // Security headers
  await registerSecurityHeaders(app);

  // Global rate limiting
  await registerGlobalRateLimit(app, redis);

  // Metrics collection
  await registerMetricsCollection(app, metricsService);

  // OpenAPI / Swagger (only if enabled)
  if (env.ENABLE_SWAGGER) {
    await app.register(swagger, {
      openapi: {
        info: {
          title: 'Secure API Gateway',
          description: 'Production-grade API Gateway with security best practices',
          version: '1.0.0',
        },
        servers: [
          {
            url: `http://localhost:${env.PORT}`,
            description: 'Development server',
          },
        ],
        components: {
          securitySchemes: {
            bearerAuth: {
              type: 'http',
              scheme: 'bearer',
              bearerFormat: 'JWT',
            },
          },
        },
        tags: [
          { name: 'Authentication', description: 'Auth endpoints' },
          { name: 'Reports', description: 'Report management' },
          { name: 'Proxy', description: 'Upstream proxy endpoints' },
          { name: 'Admin', description: 'Admin endpoints' },
          { name: 'Health', description: 'Health check endpoints' },
        ],
      },
    });

    await app.register(swaggerUi, {
      routePrefix: '/docs',
      uiConfig: {
        docExpansion: 'list',
        deepLinking: true,
      },
    });
  }

  // ============================================
  // HOOKS
  // ============================================

  // Request ID hook (runs first)
  app.addHook('onRequest', requestIdHook);

  // Request logging hook
  app.addHook('onRequest', async (request, reply) => {
    const startTime = Date.now();
    (request as any).startTime = startTime;

    logger.info(
      {
        requestId: (request as any).requestId,
        method: request.method,
        url: request.url,
        ip: request.ip,
        userAgent: request.headers['user-agent'],
      },
      'Incoming request'
    );
  });

  // Response logging hook
  app.addHook('onResponse', async (request, reply) => {
    const duration = Date.now() - ((request as any).startTime || Date.now());

    const level = reply.statusCode >= 500 ? 'error' : reply.statusCode >= 400 ? 'warn' : 'info';

    logger[level](
      {
        requestId: (request as any).requestId,
        method: request.method,
        url: request.url,
        statusCode: reply.statusCode,
        duration,
      },
      'Request completed'
    );
  });

  // ============================================
  // ERROR HANDLING
  // ============================================

  app.setErrorHandler(async (error: FastifyError | AppError, request: FastifyRequest, reply: FastifyReply) => {
    const requestId = (request as any).requestId || 'unknown';

    // Handle AppError (operational errors)
    if (error instanceof AppError) {
      logger.warn(
        {
          requestId,
          error: {
            name: error.name,
            message: error.message,
            code: error.code,
            statusCode: error.statusCode,
          },
        },
        'Operational error'
      );

      return reply.status(error.statusCode).send({
        ...error.toJSON(),
        requestId,
      });
    }

    // Handle validation errors from Fastify
    if (error.validation) {
      logger.warn({ requestId, validation: error.validation }, 'Validation error');

      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          ...(env.isDevelopment ? { details: error.validation } : {}),
        },
        requestId,
      });
    }

    // Handle unexpected errors (programming errors)
    logger.error(
      {
        requestId,
        error: {
          name: error.name,
          message: error.message,
          stack: error.stack,
        },
      },
      'Unexpected error'
    );

    // Never leak internal error details in production
    const message = env.isProduction
      ? 'Internal server error'
      : error.message || 'Internal server error';

    return reply.status(error.statusCode || 500).send({
      error: {
        code: 'INTERNAL_ERROR',
        message,
      },
      requestId,
    });
  });

  // Not found handler
  app.setNotFoundHandler(async (request, reply) => {
    const requestId = (request as any).requestId || 'unknown';

    logger.warn(
      {
        requestId,
        method: request.method,
        url: request.url,
      },
      'Route not found'
    );

    return reply.status(404).send({
      error: {
        code: 'NOT_FOUND',
        message: 'Route not found',
      },
      requestId,
    });
  });

  // ============================================
  // ROUTES
  // ============================================

  // Health check endpoints
  app.get('/healthz', {
    schema: {
      description: 'Health check endpoint',
      tags: ['Health'],
      response: {
        200: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            timestamp: { type: 'number' },
          },
        },
      },
    },
  }, async () => ({
    status: 'ok',
    timestamp: Date.now(),
  }));

  app.get('/readyz', {
    schema: {
      description: 'Readiness check endpoint',
      tags: ['Health'],
      response: {
        200: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            redis: { type: 'string' },
            timestamp: { type: 'number' },
          },
        },
      },
    },
  }, async () => {
    // Check Redis connection
    let redisStatus = 'unknown';
    try {
      await redis.ping();
      redisStatus = 'ok';
    } catch (error) {
      redisStatus = 'error';
    }

    return {
      status: redisStatus === 'ok' ? 'ok' : 'degraded',
      redis: redisStatus,
      timestamp: Date.now(),
    };
  });

  // Register module routes
  await registerAuthRoutes(app, redis);
  await registerAuditRoutes(app, auditService);
  await registerReportsRoutes(app);
  await registerProxyRoutes(app);
  await registerAdminRoutes(app, redis, auditService);

  return app;
}

// Extend Fastify instance type to include our decorations
declare module 'fastify' {
  interface FastifyInstance {
    audit: AuditService;
    metrics: MetricsService;
  }
}
