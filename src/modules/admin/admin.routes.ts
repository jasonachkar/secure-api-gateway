/**
 * Admin routes
 * Dashboard API endpoints protected by admin role
 */

import { FastifyInstance } from 'fastify';
import Redis from 'ioredis';
import { AdminController } from './admin.controller.js';
import { AdminService } from './admin.service.js';
import { MetricsService } from './metrics.service.js';
import { AuditService } from '../audit/audit.service.js';
import { requireAuth } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import { validate } from '../../middleware/validation.js';
import { auditLogQuerySchema, sessionRevokeSchema, userUnlockSchema } from './admin.schemas.js';

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
  const controller = new AdminController(adminService, metricsService);

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
   * GET /admin/metrics/realtime
   * SSE stream of real-time metrics
   */
  app.get(
    '/admin/metrics/realtime',
    {
      schema: {
        description: 'Stream real-time metrics via Server-Sent Events',
        tags: ['Admin'],
        security: [{ bearerAuth: [] }],
      },
      preHandler: adminAuth,
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
}
