/**
 * Compliance Controller
 * HTTP handlers for compliance and security posture
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { ComplianceService } from './compliance.service.js';
import type { ComplianceMetrics } from './compliance.service.js';
import { logger } from '../../lib/logger.js';

export class ComplianceController {
  constructor(private complianceService: ComplianceService) {}

  private normalizeMetrics(metrics?: ComplianceMetrics | null): ComplianceMetrics {
    return {
      nist: {
        score: metrics?.nist?.score ?? 0,
        controls: Array.isArray(metrics?.nist?.controls) ? (metrics?.nist?.controls ?? []) : [],
      },
      owasp: {
        score: metrics?.owasp?.score ?? 0,
        top10: Array.isArray(metrics?.owasp?.top10) ? (metrics?.owasp?.top10 ?? []) : [],
      },
      pci: {
        score: metrics?.pci?.score ?? 0,
        requirements: Array.isArray(metrics?.pci?.requirements) ? (metrics?.pci?.requirements ?? []) : [],
      },
      gdpr: {
        score: metrics?.gdpr?.score ?? 0,
        principles: Array.isArray(metrics?.gdpr?.principles) ? (metrics?.gdpr?.principles ?? []) : [],
      },
    };
  }

  /**
   * GET /admin/compliance/posture
   * Get security posture score
   */
  async getSecurityPosture(request: FastifyRequest, reply: FastifyReply) {
    try {
      logger.debug('Calculating security posture...');
      const posture = await this.complianceService.calculateSecurityPosture();
      // Ensure all required fields are present
      if (!posture || !posture.factors || !posture.recommendations) {
        logger.error({ posture }, 'Invalid posture data structure');
        throw new Error('Invalid posture data structure');
      }
      logger.debug({ postureScore: posture.overallScore, grade: posture.grade }, 'Security posture calculated successfully');
      reply.send({ posture });
    } catch (error: any) {
      logger.error({ error }, 'Failed to calculate security posture');
      reply.status(500).send({
        error: {
          code: 'INTERNAL_ERROR',
          message: error.message || 'Failed to calculate security posture',
        },
      });
    }
  }

  /**
   * GET /admin/compliance/metrics
   * Get compliance metrics for various frameworks
   */
  async getComplianceMetrics(request: FastifyRequest, reply: FastifyReply) {
    try {
      logger.info('Retrieving compliance metrics...');
      const metrics = await this.complianceService.getComplianceMetrics();
      const hasMetrics = !!metrics && typeof metrics === 'object';
      logger.info({ metricsType: typeof metrics, hasMetrics }, 'Metrics received from service');

      if (!hasMetrics) {
        logger.error({ metrics, metricsType: typeof metrics }, 'Compliance metrics returned null/undefined or invalid type');
      }

      const normalizedMetrics = this.normalizeMetrics(metrics);

      logger.info({
        nistControls: normalizedMetrics.nist?.controls?.length ?? 0,
        owaspRisks: normalizedMetrics.owasp?.top10?.length ?? 0,
        pciRequirements: normalizedMetrics.pci?.requirements?.length ?? 0,
        gdprPrinciples: normalizedMetrics.gdpr?.principles?.length ?? 0,
        metricsKeys: Object.keys(normalizedMetrics),
      }, 'Compliance metrics validated, sending response');

      const response = { metrics: normalizedMetrics };
      logger.info({ responseKeys: Object.keys(response) }, 'Sending compliance metrics response');
      return reply.send(response);
    } catch (error: any) {
      logger.error({ error, stack: error.stack, message: error.message }, 'Failed to retrieve compliance metrics');
      const fallbackMetrics = this.normalizeMetrics(null);
      return reply.send({ metrics: fallbackMetrics });
    }
  }
}

