/**
 * Reports service
 * Demonstrates BOLA prevention and permission checks
 */

import { httpGet } from '../../lib/httpClient.js';
import { env } from '../../config/index.js';
import { NotFoundError, ForbiddenError } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import type { Report, ReportData } from './reports.schemas.js';

/**
 * Reports service
 */
export class ReportsService {
  /**
   * Get report by ID
   * Demonstrates BOLA prevention through ownership checks
   *
   * @param reportId - Report ID
   * @param userId - Requesting user ID
   * @param roles - User roles
   * @returns Report data
   */
  async getReport(reportId: string, userId: string, roles: string[]): Promise<ReportData> {
    // Fetch report from upstream service
    const response = await httpGet<Report>(
      `${env.UPSTREAM_REPORTS_URL}/reports/${reportId}`
    );

    if (response.status === 404) {
      throw new NotFoundError('Report');
    }

    const report = response.data;

    // BOLA prevention: Check resource ownership
    // Admin can access all reports, others only their own
    if (!roles.includes('admin') && report.createdBy !== userId) {
      logger.warn(
        { userId, reportId, ownerId: report.createdBy },
        'BOLA attempt: user tried to access report they do not own'
      );
      throw new ForbiddenError('You do not have permission to access this report');
    }

    // API3: Broken Object Property Level Authorization prevention
    // Return only safe fields (no sensitive internal data)
    return this.sanitizeReport(report);
  }

  /**
   * Sanitize report data for response
   * Prevents exposure of sensitive internal fields
   *
   * @param report - Raw report data
   * @returns Sanitized report
   */
  private sanitizeReport(report: Report): ReportData {
    // Allowlist approach: only return known safe fields
    // This prevents accidentally leaking internal fields if upstream adds them
    return {
      id: report.id,
      title: report.title,
      content: report.content,
      createdAt: report.createdAt,
      createdBy: report.createdBy,
    };
  }
}
