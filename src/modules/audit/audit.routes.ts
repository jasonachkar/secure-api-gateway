/**
 * Audit log admin routes
 * Protected endpoints for viewing audit logs
 */

import { FastifyInstance, FastifyRequest } from 'fastify';
import { AuditService } from './audit.service.js';
import { requireAuth } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import { z } from 'zod';
import { validate } from '../../middleware/validation.js';

/**
 * Query parameters schema
 */
const auditQuerySchema = z.object({
  userId: z.string().optional(),
  eventType: z.string().optional(),
  startTime: z.coerce.number().int().positive().optional(),
  endTime: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(1000).default(100),
});

type AuditQuery = z.infer<typeof auditQuerySchema>;

/**
 * Register audit log routes
 */
export async function registerAuditRoutes(app: FastifyInstance, auditService: AuditService) {
  /**
   * GET /admin/audit-logs
   * Query audit logs (admin only)
   */
  app.get<{ Querystring: AuditQuery }>(
    '/admin/audit-logs',
    {
      schema: {
        description: 'Query audit logs (admin only)',
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
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              logs: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    timestamp: { type: 'number' },
                    eventType: { type: 'string' },
                    userId: { type: 'string' },
                    username: { type: 'string' },
                    ip: { type: 'string' },
                    requestId: { type: 'string' },
                    resource: { type: 'string' },
                    action: { type: 'string' },
                    success: { type: 'boolean' },
                    message: { type: 'string' },
                    metadata: { type: 'object' },
                  },
                },
              },
              count: { type: 'number' },
            },
          },
        },
      },
      preHandler: [requireAuth, requireRole('admin'), validate(auditQuerySchema, 'query')],
    },
    async (request: FastifyRequest<{ Querystring: AuditQuery }>) => {
      const filters = request.query;

      const logs = await auditService.query(filters);

      return {
        logs,
        count: logs.length,
      };
    }
  );
}
