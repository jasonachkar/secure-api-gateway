/**
 * Reports controller
 */

import { FastifyRequest } from 'fastify';
import { ReportsService } from './reports.service.js';
import { ReportIdParams, type ReportData } from './reports.schemas.js';
import { AuthenticatedRequest } from '../../types/index.js';

/**
 * Reports controller
 */
export class ReportsController {
  constructor(private reportsService: ReportsService) {}

  /**
   * GET /reports/:id
   * Get report by ID
   */
  async getReport(request: FastifyRequest<{ Params: ReportIdParams }>): Promise<ReportData> {
    const { id } = request.params;
    const user = (request as AuthenticatedRequest).user;

    const report = await this.reportsService.getReport(id, user.userId, user.roles);

    return report;
  }
}
