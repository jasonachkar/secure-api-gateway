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
import { AppError } from './lib/errors.js';
import { requestIdHook } from './middleware/requestId.js';
import { resolveTrustProxyOption, logTrustProxyConfig } from './lib/proxyTrust.js';
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
import { registerRequestTelemetry } from './lib/requestTelemetry.js';
import { TokenStore } from './modules/auth/token.store.js';
import { ApiKeyStore } from './modules/apikeys/apikey.store.js';
import { ThreatIntelService } from './modules/admin/threat-intel.service.js';
import { IncidentResponseService } from './modules/admin/incident-response.service.js';
import { ResponseService } from './modules/response/response.service.js';
import { PipelineMetrics } from './modules/security/pipeline-metrics.js';
import { GatewayAuthTracker } from './modules/security/gateway-auth-tracker.js';
import { DetectionEngine } from './modules/detection/engine.js';
import { RuleHealthTracker } from './modules/detection/rule-health.js';
import { DetectionStore } from './modules/detection/detection.store.js';
import { SecurityEventStore } from './modules/ingestion/security-event.store.js';
import { InvestigationService } from './modules/investigations/investigation.service.js';
import { registerSecurityRoutes } from './modules/security/security.routes.js';
import { registerIpBlockMiddleware } from './middleware/ipBlock.js';
import { ScenarioService } from './modules/scenarios/scenario.service.js';
import { registerScenarioRoutes } from './modules/scenarios/scenario.routes.js';
import type { PostgresClient } from './modules/ingestion/normalized-event.store.js';

async function createPostgresClient(): Promise<PostgresClient> {
  const { Pool } = await import('pg');
  return new Pool({ connectionString: env.storage.postgresUrl });
}

/**
 * Create and configure Fastify application
 */
export async function createApp(): Promise<FastifyInstance> {
  // Create Fastify instance with logger
  const app = Fastify({
    loggerInstance: logger,
    bodyLimit: env.server.bodyLimit,
    requestTimeout: env.server.requestTimeout,
    // Explicit proxy trust boundary - see lib/proxyTrust.ts and docs/PROXY_TRUST.md.
    // Never `true`: that would trust X-Forwarded-For from any direct client, letting
    // them spoof the IP every rate limit/lockout/IP-block/audit decision relies on.
    trustProxy: resolveTrustProxyOption(),
    disableRequestLogging: true, // We use custom request logging
  });

  logTrustProxyConfig();

  // Initialize Redis for rate limiting and token storage
  const redis = createRedisClient();

  // Initialize audit service
  const auditStore = createAuditStore(env.server.isProduction ? redis : undefined);
  const auditService = new AuditService(auditStore);
  await auditService.initialize();

  // Initialize metrics service
  const metricsService = new MetricsService(redis);

  // Shared token store so requireAuth can check access-token revocation
  // (auth routes also construct their own TokenStore, backed by the same Redis keyspace)
  const tokenStore = new TokenStore(redis);

  // Shared API key store (admin routes manage keys, proxy routes accept them)
  const apiKeyStore = new ApiKeyStore(redis);

  // Security control-plane services, constructed here (not inside admin routes)
  // so the IP-block enforcement hook can run early, ahead of route registration,
  // and so admin/investigation/scenario routes all share one instance instead of
  // each standing up their own Redis-backed service.
  const incidentService = new IncidentResponseService(redis);
  const threatIntelService = new ThreatIntelService(redis, incidentService);
  const pipelineMetrics = new PipelineMetrics(redis);
  const responseService = new ResponseService(redis, threatIntelService, tokenStore, auditService, pipelineMetrics);
  // Optional durability for the canonical security-event pipeline (Redis is always the
  // source of truth for reads/dedup; Postgres, when configured, is a durable copy - see
  // SecurityEventStore). Shared by every consumer of securityEventStore below, including
  // the live AWS/GCP ingestion adapters wired up in admin.routes.ts.
  const postgresPool = env.storage.postgresUrl ? await createPostgresClient() : undefined;
  const securityEventStore = new SecurityEventStore(redis, postgresPool);
  await securityEventStore.initialize();
  const ruleHealthTracker = new RuleHealthTracker(redis);
  const detectionEngine = new DetectionEngine(undefined, pipelineMetrics, ruleHealthTracker);
  const detectionStore = new DetectionStore(redis);
  const investigationService = new InvestigationService(redis, pipelineMetrics);
  const gatewayAuthTracker = new GatewayAuthTracker(redis, env.auth.gwAuthDetectionWindowMs);

  if (postgresPool) {
    app.addHook('onClose', async () => {
      await postgresPool.end?.();
    });
  }

  // Decorate app with services for use in routes
  app.decorate('audit', auditService);
  app.decorate('metrics', metricsService);
  app.decorate('tokenStore', tokenStore);
  app.decorate('apiKeyStore', apiKeyStore);
  app.decorate('incidentService', incidentService);
  app.decorate('threatIntelService', threatIntelService);
  app.decorate('pipelineMetrics', pipelineMetrics);
  app.decorate('responseService', responseService);
  app.decorate('securityEventStore', securityEventStore);
  app.decorate('detectionEngine', detectionEngine);
  app.decorate('detectionStore', detectionStore);
  app.decorate('investigationService', investigationService);

  // ============================================
  // PLUGINS
  // ============================================

  // Cookie parser (for refresh tokens)
  await app.register(cookie, {
    secret: env.security.cookieSecret,
    parseOptions: {
      httpOnly: true,
      secure: env.server.isProduction,
      sameSite: 'strict',
    },
  });

  // CORS - explicit origin allowlist (env.security.corsOrigins, from CORS_ORIGIN).
  // env.ts already refuses to boot with a wildcard here in production; this is what
  // actually enforces it at the HTTP layer.
  await app.register(cors, {
    origin: env.security.corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID', 'Cache-Control', 'Accept'],
    exposedHeaders: ['X-Request-ID', 'RateLimit-*', 'Content-Type'],
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

  // Blocked-IP enforcement - runs early, ahead of business logic, so a blocked
  // IP is rejected before it can reach auth/proxy/admin routes. Real Redis-backed
  // block set, audited, response-action-tracked (see docs/SECURITY_CONTROLS.md).
  registerIpBlockMiddleware(app, threatIntelService, auditService, responseService);

  // Metrics collection
  await registerMetricsCollection(app, metricsService);

  // Rolling in-memory log of recent requests, powering the dashboard's Request Inspector
  registerRequestTelemetry(app);

  // OpenAPI / Swagger (only if enabled)
  if (env.features.enableSwagger) {
    await app.register(swagger, {
      openapi: {
        info: {
          title: 'Secure API Gateway',
          description: 'Production-grade API Gateway with security best practices',
          version: '1.0.0',
        },
        servers: [
          {
            url: `http://localhost:${env.server.port}`,
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
          ...(env.server.isDevelopment ? { details: error.validation } : {}),
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
    const message = env.server.isProduction
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
            uptimeSeconds: { type: 'number' },
          },
        },
      },
    },
  }, async () => ({
    status: 'ok',
    timestamp: Date.now(),
    // process.uptime() is the real, honest signal here - this app doesn't track historical
    // downtime, so it deliberately doesn't report a fabricated SLA percentage.
    uptimeSeconds: Math.floor(process.uptime()),
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
  await registerAuthRoutes(app, redis, auditService, {
    detectionEngine,
    detectionStore,
    securityEventStore,
    investigationService,
    pipelineMetrics,
    gatewayAuthTracker,
  });
  await registerAuditRoutes(app, auditService);
  await registerReportsRoutes(app, redis);
  await registerProxyRoutes(app, redis);
  await registerAdminRoutes(app, redis, auditService);
  await registerSecurityRoutes(app, {
    investigationService,
    securityEventStore,
    detectionEngine,
    detectionStore,
    pipelineMetrics,
    responseService,
    auditService,
  });

  const scenarioService = new ScenarioService({
    redis,
    threatIntelService,
    responseService,
    auditService,
    securityEventStore,
    detectionEngine,
    detectionStore,
    investigationService,
    pipelineMetrics,
    gatewayAuthTracker,
    app,
  });
  await registerScenarioRoutes(app, redis, scenarioService);
  app.decorate('scenarioService', scenarioService);

  return app;
}

// Extend Fastify instance type to include our decorations
declare module 'fastify' {
  interface FastifyInstance {
    audit: AuditService;
    metrics: MetricsService;
    tokenStore: TokenStore;
    apiKeyStore: ApiKeyStore;
    incidentService: IncidentResponseService;
    threatIntelService: ThreatIntelService;
    pipelineMetrics: PipelineMetrics;
    responseService: ResponseService;
    securityEventStore: SecurityEventStore;
    detectionEngine: DetectionEngine;
    detectionStore: DetectionStore;
    investigationService: InvestigationService;
    scenarioService: ScenarioService;
  }
}
