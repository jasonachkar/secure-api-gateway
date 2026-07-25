/**
 * Admin routes
 * Dashboard API endpoints protected by admin role
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import Redis from 'ioredis';
import { AdminController } from './admin.controller.js';
import { AdminService } from './admin.service.js';
import { MetricsService } from './metrics.service.js';
import { ThreatIntelController } from './threat-intel.controller.js';
import { IncidentResponseController } from './incident-response.controller.js';
import { ComplianceService } from './compliance.service.js';
import { ComplianceController } from './compliance.controller.js';
import { MetricsSeederService } from './metrics-seeder.service.js';
import { AuditService } from '../audit/audit.service.js';
import { AdminAuditLogService } from './audit-log.service.js';
import { IngestionService } from '../ingestion/ingestion.service.js';
import { IngestionController } from '../ingestion/ingestion.controller.js';
import { requireAuth, verifyToken } from '../../middleware/auth.js';
import { requireAnyRole, requireRole } from '../../middleware/rbac.js';
import { validate } from '../../middleware/validation.js';
import {
  adminAuditLogQuerySchema,
  auditLogQuerySchema,
  sessionRevokeSchema,
  userUnlockSchema,
  createApiKeySchema,
  apiKeyIdParamsSchema,
  type CreateApiKeyBody,
  type ApiKeyIdParams,
} from './admin.schemas.js';
import { UnauthorizedError, NotFoundError } from '../../lib/errors.js';
import { env } from '../../config/index.js';
import { AuditEventType } from '../audit/audit.types.js';
import { getClientIp, getRequestId } from '../../lib/requestContext.js';
import { upstreamCircuitBreaker } from '../../lib/httpClient.js';
import { getRecentRequests } from '../../lib/requestTelemetry.js';

/**
 * SSE authentication middleware
 * Reads token from query parameter (EventSource doesn't support headers)
 */
async function requireAuthSSE(request: FastifyRequest, reply: FastifyReply) {
  const token = (request.query as any).token;

  if (!token) {
    throw new UnauthorizedError('Missing authentication token');
  }

  try {
    const payload = verifyToken(token);
    (request as any).user = {
      userId: payload.sub,
      username: payload.username,
      roles: payload.roles,
      permissions: payload.permissions,
      jti: payload.jti,
    };
  } catch (error) {
    throw new UnauthorizedError('Invalid authentication token');
  }
}

/**
 * Register admin routes
 * All routes require authentication + admin role
 */
export async function registerAdminRoutes(
  app: FastifyInstance,
  redis: Redis,
  auditService: AuditService
) {
  // Initialize services
  const metricsService = new MetricsService(redis);
  const adminService = new AdminService(redis, auditService);
  // Shared instances constructed once in app.ts (also used by the early
  // IP-block enforcement hook) - reuse them here instead of standing up a
  // second set operating on the same Redis keyspace.
  const incidentService = app.incidentService;
  const threatIntelService = app.threatIntelService;
  const adminAuditLogService = new AdminAuditLogService(redis);
  const controller = new AdminController(adminService, metricsService, adminAuditLogService);
  const threatController = new ThreatIntelController(threatIntelService);
  const incidentController = new IncidentResponseController(incidentService);
  const complianceService = new ComplianceService(redis, metricsService, threatIntelService, adminService);
  const complianceController = new ComplianceController(complianceService);
  // Live AWS/GCP polling adapters feed the same canonical pipeline everything else uses
  // (constructed once in app.ts, decorated onto `app` before routes are registered) -
  // there is no separate legacy ingestion path anymore. See docs/CLOUD_INGESTION.md.
  const ingestionService = new IngestionService(redis, {
    securityEventStore: app.securityEventStore,
    detectionEngine: app.detectionEngine,
    detectionStore: app.detectionStore,
    investigationService: app.investigationService,
    pipelineMetrics: app.pipelineMetrics,
  });
  ingestionService.start();
  const ingestionController = new IngestionController(ingestionService);

  app.addHook('onClose', async () => {
    ingestionService.stop();
  });

  // Synthetic background data (fabricated requests/logins/threat events on a timer) is
  // off by default - it must never be mistaken for real telemetry in the default reviewer
  // experience. Opt in explicitly via ENABLE_SYNTHETIC_BACKGROUND_DATA=true for local demos.
  // See docs/KNOWN_LIMITATIONS.md.
  let metricsSeeder: MetricsSeederService | undefined;
  if (env.features.enableSyntheticBackgroundData) {
    metricsSeeder = new MetricsSeederService(redis, metricsService, threatIntelService);
    metricsSeeder.start();
    app.addHook('onClose', async () => {
      metricsSeeder?.stop();
    });
  }

  await adminAuditLogService.initialize();

  // All admin routes require admin role. metricsAuth additionally allows the
  // read-only reviewer role (see ROLES.reviewer) - metrics/ingestion-status are
  // informational only, never mutate state.
  const adminAuth = [requireAuth, requireRole('admin')];
  const metricsAuth = [requireAuth, requireAnyRole(['admin', 'security_analyst', 'reviewer'])];
  const incidentAuth = [requireAuth, requireAnyRole(['admin', 'incident_responder'])];

  app.addHook('onResponse', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.url.startsWith('/admin')) {
      return;
    }

    const user = (request as any).user;
    if (!user) {
      return;
    }

    const context = (request as any).adminAuditContext as
      | {
          action?: string;
          incidentId?: string;
        }
      | undefined;

    const action = context?.action ?? `${request.method} ${request.routeOptions.url ?? request.url}`;
    const incidentId =
      context?.incidentId ?? (typeof request.params === 'object' ? (request.params as any).id : undefined);

    await adminAuditLogService.log({
      actor: {
        userId: user.userId,
        username: user.username,
      },
      action,
      resource: request.routeOptions.url ?? request.url,
      incidentId,
      metadata: {
        statusCode: reply.statusCode,
      },
    });
  });

  /**
   * GET /admin/metrics/summary
   * Get current metrics summary snapshot
   */
  app.get(
    '/admin/metrics/summary',
    {
      schema: {
        description: 'Get current security metrics summary',
        tags: ['Admin'],
        security: [{ bearerAuth: [] }],
      },
      preHandler: metricsAuth,
    },
    controller.getMetricsSummary.bind(controller)
  );

  /**
   * GET /admin/ingestion/status
   * Get ingestion adapter + storage status
   */
  app.get(
    '/admin/ingestion/status',
    {
      schema: {
        description: 'Get ingestion adapter status and storage health',
        tags: ['Admin'],
        security: [{ bearerAuth: [] }],
      },
      preHandler: adminAuth,
    },
    ingestionController.getStatus.bind(ingestionController)
  );

  /**
   * GET /admin/requests/live
   * Rolling log of recent requests (method, path, authenticated user, RBAC decision,
   * rate limit remaining, status, latency) - powers the dashboard's Request Inspector.
   * Polled rather than pushed over SSE; the data changes fast enough that a 2s poll
   * interval on the client is indistinguishable from a push for this use case, without
   * a second raw SSE writer to maintain alongside /admin/metrics/realtime.
   */
  app.get(
    '/admin/requests/live',
    {
      schema: {
        description: 'Get the most recent requests through the gateway',
        tags: ['Admin'],
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            limit: { type: 'number', minimum: 1, maximum: 100, default: 20 },
          },
        },
      },
      preHandler: metricsAuth,
    },
    async (request: FastifyRequest) => {
      const { limit } = request.query as { limit?: number };
      return { requests: getRecentRequests(limit ?? 20) };
    }
  );

  /**
   * OPTIONS /admin/metrics/realtime
   * Handle CORS preflight for SSE endpoint
   */
  app.options('/admin/metrics/realtime', async (request: FastifyRequest, reply: FastifyReply) => {
    // Access-Control-Allow-Credentials: true requires an exact, non-wildcard origin -
    // reflecting an arbitrary request Origin here would let any site read this SSE
    // stream using the visitor's cookies/session. Only ever echo back an origin that
    // is in the same explicit allowlist the main CORS plugin enforces (env.security.corsOrigins).
    const requestOrigin = request.headers.origin;
    if (requestOrigin && env.security.corsOrigins.includes(requestOrigin)) {
      reply.header('Access-Control-Allow-Origin', requestOrigin);
      reply.header('Access-Control-Allow-Credentials', 'true');
      reply.header('Vary', 'Origin');
    }
    reply.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
    reply.header('Access-Control-Allow-Headers', 'Cache-Control, Content-Type, Authorization, Accept');
    reply.code(204).send();
  });

  /**
   * GET /admin/metrics/realtime
   * SSE stream of real-time metrics
   */
  app.get(
    '/admin/metrics/realtime',
    {
      schema: {
        description: 'Stream real-time metrics via Server-Sent Events',
        tags: ['Admin'],
        querystring: {
          type: 'object',
          required: ['token'],
          properties: {
            token: { type: 'string', description: 'JWT access token' },
          },
        },
      },
      preHandler: [requireAuthSSE, requireAnyRole(['admin', 'security_analyst'])],
    },
    controller.streamRealtimeMetrics.bind(controller)
  );

  /**
   * GET /admin/audit/logs
   * Query audit logs with filters
   */
  app.get(
    '/admin/audit/logs',
    {
      schema: {
        description: 'Query audit logs',
        tags: ['Admin'],
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            userId: { type: 'string' },
            eventType: { type: 'string' },
            startTime: { type: 'number' },
            endTime: { type: 'number' },
            limit: { type: 'number', minimum: 1, maximum: 1000, default: 100 },
            offset: { type: 'number', minimum: 0, default: 0 },
          },
        },
      },
      preHandler: [...adminAuth, validate(auditLogQuerySchema, 'query')],
    },
    controller.getAuditLogs.bind(controller)
  );

  /**
   * GET /admin/audit/admin-actions
   * Query admin action logs
   */
  app.get(
    '/admin/audit/admin-actions',
    {
      schema: {
        description: 'Query admin action logs',
        tags: ['Admin'],
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            actorId: { type: 'string' },
            action: { type: 'string' },
            incidentId: { type: 'string' },
            startTime: { type: 'number' },
            endTime: { type: 'number' },
            limit: { type: 'number', minimum: 1, maximum: 1000, default: 100 },
            offset: { type: 'number', minimum: 0, default: 0 },
          },
        },
      },
      preHandler: [...adminAuth, validate(adminAuditLogQuerySchema, 'query')],
    },
    controller.getAdminActionLogs.bind(controller)
  );

  /**
   * GET /admin/sessions/active
   * Get all active user sessions
   */
  app.get(
    '/admin/sessions/active',
    {
      schema: {
        description: 'Get all active sessions',
        tags: ['Admin'],
        security: [{ bearerAuth: [] }],
      },
      preHandler: adminAuth,
    },
    controller.getActiveSessions.bind(controller)
  );

  /**
   * POST /admin/sessions/:jti/revoke
   * Revoke a specific session
   */
  app.post(
    '/admin/sessions/:jti/revoke',
    {
      schema: {
        description: 'Revoke a user session',
        tags: ['Admin'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['jti'],
          properties: {
            jti: { type: 'string' },
          },
        },
      },
      preHandler: [...adminAuth, validate(sessionRevokeSchema, 'params')],
    },
    controller.revokeSession.bind(controller)
  );

  /**
   * GET /admin/users
   * Get all users with lockout status
   */
  app.get(
    '/admin/users',
    {
      schema: {
        description: 'Get all users with lockout status',
        tags: ['Admin'],
        security: [{ bearerAuth: [] }],
      },
      preHandler: adminAuth,
    },
    controller.getUsers.bind(controller)
  );

  /**
   * POST /admin/users/:userId/unlock
   * Unlock a user account
   */
  app.post(
    '/admin/users/:userId/unlock',
    {
      schema: {
        description: 'Unlock a user account',
        tags: ['Admin'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['userId'],
          properties: {
            userId: { type: 'string' },
          },
        },
      },
      preHandler: [...adminAuth, validate(userUnlockSchema, 'params')],
    },
    controller.unlockUser.bind(controller)
  );

  /**
   * GET /admin/health
   * System health check
   */
  app.get(
    '/admin/health',
    {
      schema: {
        description: 'Get system health status',
        tags: ['Admin'],
        security: [{ bearerAuth: [] }],
      },
      preHandler: adminAuth,
    },
    controller.getHealth.bind(controller)
  );

  /**
   * GET /admin/config
   * Get runtime configuration flags
   */
  app.get(
    '/admin/config',
    {
      schema: {
        description: 'Get runtime configuration flags',
        tags: ['Admin'],
        security: [{ bearerAuth: [] }],
      },
      preHandler: adminAuth,
    },
    controller.getConfig.bind(controller)
  );

  // ======================
  // Threat Intelligence Routes
  // ======================

  /**
   * GET /admin/threats
   * Get all tracked threats
   */
  app.get(
    '/admin/threats',
    {
      schema: {
        description: 'Get all tracked threats',
        tags: ['Threat Intelligence'],
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            limit: { type: 'number', minimum: 1, maximum: 1000, default: 100 },
          },
        },
      },
      preHandler: adminAuth,
    },
    threatController.getAllThreats.bind(threatController)
  );

  /**
   * GET /admin/threats/top
   * Get top threats by score
   */
  app.get(
    '/admin/threats/top',
    {
      schema: {
        description: 'Get top threats by threat score',
        tags: ['Threat Intelligence'],
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            limit: { type: 'number', minimum: 1, maximum: 50, default: 10 },
          },
        },
      },
      preHandler: adminAuth,
    },
    threatController.getTopThreats.bind(threatController)
  );

  /**
   * GET /admin/threats/statistics
   * Get threat statistics
   */
  app.get(
    '/admin/threats/statistics',
    {
      schema: {
        description: 'Get threat intelligence statistics',
        tags: ['Threat Intelligence'],
        security: [{ bearerAuth: [] }],
      },
      preHandler: adminAuth,
    },
    threatController.getStatistics.bind(threatController)
  );

  /**
   * GET /admin/threats/patterns
   * Detect attack patterns
   */
  app.get(
    '/admin/threats/patterns',
    {
      schema: {
        description: 'Detect attack patterns from threat data',
        tags: ['Threat Intelligence'],
        security: [{ bearerAuth: [] }],
      },
      preHandler: adminAuth,
    },
    threatController.getAttackPatterns.bind(threatController)
  );

  /**
   * GET /admin/threats/ip/:ip
   * Get threat information for specific IP
   */
  app.get(
    '/admin/threats/ip/:ip',
    {
      schema: {
        description: 'Get threat information for specific IP address',
        tags: ['Threat Intelligence'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['ip'],
          properties: {
            ip: { type: 'string' },
          },
        },
      },
      preHandler: adminAuth,
    },
    threatController.getIPThreat.bind(threatController)
  );

  /**
   * POST /admin/threats/ip/:ip/block
   * Block an IP address
   */
  app.post(
    '/admin/threats/ip/:ip/block',
    {
      schema: {
        description: 'Block an IP address',
        tags: ['Threat Intelligence'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['ip'],
          properties: {
            ip: { type: 'string' },
          },
        },
        body: {
          type: 'object',
          properties: {
            reason: { type: 'string' },
          },
        },
      },
      preHandler: adminAuth,
    },
    threatController.blockIP.bind(threatController)
  );

  /**
   * POST /admin/threats/ip/:ip/unblock
   * Unblock an IP address
   */
  app.post(
    '/admin/threats/ip/:ip/unblock',
    {
      schema: {
        description: 'Unblock an IP address',
        tags: ['Threat Intelligence'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['ip'],
          properties: {
            ip: { type: 'string' },
          },
        },
      },
      preHandler: adminAuth,
    },
    threatController.unblockIP.bind(threatController)
  );

  /**
   * GET /admin/threats/blocked
   * Get all blocked IPs
   */
  app.get(
    '/admin/threats/blocked',
    {
      schema: {
        description: 'Get all blocked IP addresses',
        tags: ['Threat Intelligence'],
        security: [{ bearerAuth: [] }],
      },
      preHandler: adminAuth,
    },
    threatController.getBlockedIPs.bind(threatController)
  );

  // ======================
  // Incident Response Routes
  // ======================

  /**
   * POST /admin/incidents
   * Create a new incident
   */
  app.post(
    '/admin/incidents',
    {
      schema: {
        description: 'Create a new security incident',
        tags: ['Incident Response'],
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          required: ['title', 'description', 'type', 'severity'],
          properties: {
            title: { type: 'string' },
            description: { type: 'string' },
            type: { type: 'string', enum: ['brute_force', 'credential_stuffing', 'rate_limit_abuse', 'account_lockout', 'suspicious_activity', 'data_breach', 'ddos', 'malware', 'unauthorized_access', 'other'] },
            severity: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
            affectedIPs: { type: 'array', items: { type: 'string' } },
            affectedUsers: { type: 'array', items: { type: 'string' } },
            tags: { type: 'array', items: { type: 'string' } },
            metadata: { type: 'object' },
          },
        },
      },
      preHandler: incidentAuth,
    },
    incidentController.createIncident.bind(incidentController)
  );

  /**
   * GET /admin/incidents
   * Get all incidents with optional filters
   */
  app.get(
    '/admin/incidents',
    {
      schema: {
        description: 'Get all incidents with optional filters',
        tags: ['Incident Response'],
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            status: { type: 'string', enum: ['open', 'investigating', 'contained', 'resolved', 'closed'] },
            severity: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
            type: { type: 'string' },
            limit: { type: 'number', minimum: 1, maximum: 1000, default: 100 },
            offset: { type: 'number', minimum: 0, default: 0 },
          },
        },
      },
      preHandler: incidentAuth,
    },
    incidentController.getIncidents.bind(incidentController)
  );

  /**
   * GET /admin/incidents/:id
   * Get a specific incident
   */
  app.get(
    '/admin/incidents/:id',
    {
      schema: {
        description: 'Get a specific incident by ID',
        tags: ['Incident Response'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string' },
          },
        },
      },
      preHandler: incidentAuth,
    },
    incidentController.getIncident.bind(incidentController)
  );

  /**
   * PATCH /admin/incidents/:id/status
   * Update incident status
   */
  app.patch(
    '/admin/incidents/:id/status',
    {
      schema: {
        description: 'Update incident status',
        tags: ['Incident Response'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string' },
          },
        },
        body: {
          type: 'object',
          required: ['status'],
          properties: {
            status: { type: 'string', enum: ['open', 'investigating', 'contained', 'resolved', 'closed'] },
          },
        },
      },
      preHandler: incidentAuth,
    },
    incidentController.updateStatus.bind(incidentController)
  );

  /**
   * PATCH /admin/incidents/:id/assign
   * Assign incident to user
   */
  app.patch(
    '/admin/incidents/:id/assign',
    {
      schema: {
        description: 'Assign incident to a user',
        tags: ['Incident Response'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string' },
          },
        },
        body: {
          type: 'object',
          required: ['assignedTo'],
          properties: {
            assignedTo: { type: 'string' },
          },
        },
      },
      preHandler: incidentAuth,
    },
    incidentController.assignIncident.bind(incidentController)
  );

  /**
   * POST /admin/incidents/:id/notes
   * Add note to incident
   */
  app.post(
    '/admin/incidents/:id/notes',
    {
      schema: {
        description: 'Add a note to an incident',
        tags: ['Incident Response'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string' },
          },
        },
        body: {
          type: 'object',
          required: ['content'],
          properties: {
            content: { type: 'string' },
          },
        },
      },
      preHandler: incidentAuth,
    },
    incidentController.addNote.bind(incidentController)
  );

  /**
   * POST /admin/incidents/:id/actions
   * Execute a playbook action (mocked)
   */
  app.post(
    '/admin/incidents/:id/actions',
    {
      schema: {
        description: 'Execute a playbook action for an incident (mocked)',
        tags: ['Incident Response'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string' },
          },
        },
        body: {
          type: 'object',
          required: ['action'],
          properties: {
            action: { type: 'string' },
            target: { type: 'string' },
          },
        },
      },
      preHandler: adminAuth,
    },
    incidentController.executePlaybookAction.bind(incidentController)
  );

  /**
   * PATCH /admin/incidents/:id
   * Update incident details
   */
  app.patch(
    '/admin/incidents/:id',
    {
      schema: {
        description: 'Update incident details',
        tags: ['Incident Response'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string' },
          },
        },
        body: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            description: { type: 'string' },
            severity: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
            tags: { type: 'array', items: { type: 'string' } },
            affectedIPs: { type: 'array', items: { type: 'string' } },
            affectedUsers: { type: 'array', items: { type: 'string' } },
          },
        },
      },
      preHandler: incidentAuth,
    },
    incidentController.updateIncident.bind(incidentController)
  );

  /**
   * POST /admin/incidents/:id/playbook
   * Run incident response playbook action (mocked)
   */
  app.post(
    '/admin/incidents/:id/playbook',
    {
      schema: {
        description: 'Run an incident response playbook action',
        tags: ['Incident Response'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string' },
          },
        },
        body: {
          type: 'object',
          required: ['action'],
          properties: {
            action: { type: 'string' },
            target: { type: 'string' },
          },
        },
      },
      preHandler: adminAuth,
    },
    incidentController.runPlaybookAction.bind(incidentController)
  );

  /**
   * GET /admin/incidents/statistics
   * Get incident statistics
   */
  app.get(
    '/admin/incidents/statistics',
    {
      schema: {
        description: 'Get incident response statistics',
        tags: ['Incident Response'],
        security: [{ bearerAuth: [] }],
      },
      preHandler: incidentAuth,
    },
    incidentController.getStatistics.bind(incidentController)
  );

  /**
   * POST /admin/incidents/seed-test-data
   * Seed test incidents for development/demo (admin only)
   */
  if (env.features.demoMode) {
    app.post(
      '/admin/incidents/seed-test-data',
      {
        schema: {
          description: 'Create sample incidents for testing/demo purposes',
          tags: ['Incident Response'],
          security: [{ bearerAuth: [] }],
        },
        preHandler: adminAuth,
      },
      incidentController.seedTestIncidents.bind(incidentController)
    );
  }

  // ======================
  // Compliance Routes
  // ======================

  /**
   * GET /admin/compliance/posture
   * Get security posture score
   */
  app.get(
    '/admin/compliance/posture',
    {
      schema: {
        description: 'Get security posture score and factors',
        tags: ['Compliance'],
        security: [{ bearerAuth: [] }],
      },
      preHandler: adminAuth,
    },
    complianceController.getSecurityPosture.bind(complianceController)
  );

  /**
   * GET /admin/compliance/metrics
   * Get compliance metrics for various frameworks
   */
  app.get(
    '/admin/compliance/metrics',
    {
      schema: {
        description: 'Get compliance metrics for NIST, OWASP, PCI, GDPR',
        tags: ['Compliance'],
        security: [{ bearerAuth: [] }],
      },
      preHandler: adminAuth,
    },
    complianceController.getComplianceMetrics.bind(complianceController)
  );

  /**
   * GET /admin/upstream-health
   * Circuit breaker state per upstream host - closed/open/half-open and
   * consecutive-failure counts, so an operator can see a failing upstream
   * before it shows up as a wave of user-facing 503s.
   */
  app.get(
    '/admin/upstream-health',
    {
      schema: {
        description: 'Circuit breaker state for upstream hosts',
        tags: ['Admin'],
        security: [{ bearerAuth: [] }],
      },
      preHandler: metricsAuth,
    },
    async () => {
      return { upstreams: upstreamCircuitBreaker.getSnapshot() };
    }
  );

  // ======================
  // API Key Routes
  // ======================

  /**
   * POST /admin/api-keys
   * Create a scoped API key. The raw key is returned exactly once - it is
   * never recoverable again, only revocable.
   */
  app.post<{ Body: CreateApiKeyBody }>(
    '/admin/api-keys',
    {
      schema: {
        description: 'Create a scoped API key (the raw key is only ever shown in this response)',
        tags: ['API Keys'],
        security: [{ bearerAuth: [] }],
      },
      preHandler: [...adminAuth, validate(createApiKeySchema, 'body')],
    },
    async (request, reply) => {
      const user = (request as any).user;
      const { name, scopes, expiresInDays } = request.body;

      const { record, rawKey } = await app.apiKeyStore.create({
        name,
        scopes,
        createdBy: user.userId,
        expiresInDays,
      });

      await auditService.log({
        eventType: AuditEventType.APIKEY_CREATED,
        userId: user.userId,
        username: user.username,
        ip: getClientIp(request),
        requestId: getRequestId(request),
        resource: '/admin/api-keys',
        action: 'POST',
        success: true,
        message: `API key "${name}" created`,
        metadata: { apiKeyId: record.id, scopes },
      });

      return reply.code(201).send({ apiKey: record, rawKey });
    }
  );

  /**
   * GET /admin/api-keys
   * List API keys (metadata only - never returns raw or hashed secrets)
   */
  app.get(
    '/admin/api-keys',
    {
      schema: {
        description: 'List API keys',
        tags: ['API Keys'],
        security: [{ bearerAuth: [] }],
      },
      preHandler: adminAuth,
    },
    async () => {
      const apiKeys = await app.apiKeyStore.list();
      return { apiKeys };
    }
  );

  /**
   * DELETE /admin/api-keys/:id
   * Revoke an API key
   */
  app.delete<{ Params: ApiKeyIdParams }>(
    '/admin/api-keys/:id',
    {
      schema: {
        description: 'Revoke an API key',
        tags: ['API Keys'],
        security: [{ bearerAuth: [] }],
      },
      preHandler: [...adminAuth, validate(apiKeyIdParamsSchema, 'params')],
    },
    async (request, reply) => {
      const user = (request as any).user;
      const record = await app.apiKeyStore.revoke(request.params.id);

      if (!record) {
        throw new NotFoundError('API key');
      }

      await auditService.log({
        eventType: AuditEventType.APIKEY_REVOKED,
        userId: user.userId,
        username: user.username,
        ip: getClientIp(request),
        requestId: getRequestId(request),
        resource: '/admin/api-keys',
        action: 'DELETE',
        success: true,
        message: `API key "${record.name}" revoked`,
        metadata: { apiKeyId: record.id },
      });

      return reply.send({ apiKey: record });
    }
  );
}
