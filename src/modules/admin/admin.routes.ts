/**
 * Admin routes
 * Dashboard API endpoints protected by admin role
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import Redis from 'ioredis';
import { AdminController } from './admin.controller.js';
import { AdminService } from './admin.service.js';
import { MetricsService } from './metrics.service.js';
import { ThreatIntelService } from './threat-intel.service.js';
import { ThreatIntelController } from './threat-intel.controller.js';
import { IncidentResponseService } from './incident-response.service.js';
import { IncidentResponseController } from './incident-response.controller.js';
import { ComplianceService } from './compliance.service.js';
import { ComplianceController } from './compliance.controller.js';
import { MetricsSeederService } from './metrics-seeder.service.js';
import { AuditService } from '../audit/audit.service.js';
import { requireAuth, verifyToken } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import { validate } from '../../middleware/validation.js';
import { auditLogQuerySchema, sessionRevokeSchema, userUnlockSchema } from './admin.schemas.js';
import { UnauthorizedError } from '../../lib/errors.js';

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
  const incidentService = new IncidentResponseService(redis);
  // Pass incident service to threat intel for auto-incident creation
  const threatIntelService = new ThreatIntelService(redis, incidentService);
  const controller = new AdminController(adminService, metricsService);
  const threatController = new ThreatIntelController(threatIntelService);
  const incidentController = new IncidentResponseController(incidentService);
  const complianceService = new ComplianceService(redis, metricsService, threatIntelService, adminService);
  const complianceController = new ComplianceController(complianceService);

  // Start metrics seeder to generate realistic data
  const metricsSeeder = new MetricsSeederService(redis, metricsService, threatIntelService);
  metricsSeeder.start();

  // All admin routes require admin role
  const adminAuth = [requireAuth, requireRole('admin')];

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
      preHandler: adminAuth,
    },
    controller.getMetricsSummary.bind(controller)
  );

  /**
   * GET /admin/metrics/ingestion
   * Get ingestion status for connected data sources
   */
  app.get(
    '/admin/metrics/ingestion',
    {
      schema: {
        description: 'Get ingestion status for connected data sources',
        tags: ['Admin'],
        security: [{ bearerAuth: [] }],
      },
      preHandler: adminAuth,
    },
    controller.getIngestionStatus.bind(controller)
  );

  /**
   * OPTIONS /admin/metrics/realtime
   * Handle CORS preflight for SSE endpoint
   */
  app.options('/admin/metrics/realtime', async (request: FastifyRequest, reply: FastifyReply) => {
    const origin = request.headers.origin || '*';
    
    reply.header('Access-Control-Allow-Origin', origin);
    reply.header('Access-Control-Allow-Credentials', 'true');
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
      preHandler: [requireAuthSSE, requireRole('admin')],
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
      preHandler: adminAuth,
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
      preHandler: adminAuth,
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
      preHandler: adminAuth,
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
      preHandler: adminAuth,
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
      preHandler: adminAuth,
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
      preHandler: adminAuth,
    },
    incidentController.addNote.bind(incidentController)
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
      preHandler: adminAuth,
    },
    incidentController.updateIncident.bind(incidentController)
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
      preHandler: adminAuth,
    },
    incidentController.getStatistics.bind(incidentController)
  );

  /**
   * POST /admin/incidents/seed-test-data
   * Seed test incidents for development/demo (admin only)
   */
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
}
