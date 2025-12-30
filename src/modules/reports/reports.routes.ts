/**
 * Reports routes
 */

import { FastifyInstance } from 'fastify';
import { ReportsController } from './reports.controller.js';
import { ReportsService } from './reports.service.js';
import { reportIdSchema, type ReportIdParams } from './reports.schemas.js';
import { requireAuth } from '../../middleware/auth.js';
import { requirePermission } from '../../middleware/rbac.js';
import { validate } from '../../middleware/validation.js';

/**
 * Register reports routes
 */
export async function registerReportsRoutes(app: FastifyInstance) {
  const service = new ReportsService();
  const controller = new ReportsController(service);

  /**
   * GET /reports/:id
   * Get report by ID (requires read:reports permission)
   */
  app.get<{ Params: ReportIdParams }>(
    '/reports/:id',
    {
      schema: {
        description: 'Get report by ID',
        tags: ['Reports'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string', pattern: '^[a-zA-Z0-9-]+$' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              title: { type: 'string' },
              content: { type: 'string' },
              createdAt: { type: 'number' },
              createdBy: { type: 'string' },
            },
          },
        },
      },
      preHandler: [
        requireAuth,
        requirePermission('read:reports'),
        validate(reportIdSchema, 'params'),
      ],
    },
    controller.getReport.bind(controller)
  );
}
