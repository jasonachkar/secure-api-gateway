/**
 * Compliance Controller
 * HTTP handlers for compliance and security posture
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { ComplianceService } from './compliance.service.js';
import { logger } from '../../lib/logger.js';

export class ComplianceController {
  constructor(private complianceService: ComplianceService) {}

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
      logger.info({ metricsType: typeof metrics, hasMetrics: !!metrics }, 'Metrics received from service');
      
      // Ensure all required arrays are present and not empty
      if (!metrics || typeof metrics !== 'object') {
        logger.error({ metrics, metricsType: typeof metrics }, 'Compliance metrics returned null/undefined or invalid type');
        return reply.status(500).send({
          error: {
            code: 'INTERNAL_ERROR',
            message: 'Failed to retrieve compliance metrics: invalid data structure',
          },
        });
      }
      
      // Ensure all framework sections exist
      if (!metrics.nist) {
        logger.warn('Missing NIST data, initializing...');
        metrics.nist = { score: 0, controls: [] };
      }
      if (!metrics.owasp) {
        logger.warn('Missing OWASP data, initializing...');
        metrics.owasp = { score: 0, top10: [] };
      }
      if (!metrics.pci) {
        logger.warn('Missing PCI data, initializing...');
        metrics.pci = { score: 0, requirements: [] };
      }
      if (!metrics.gdpr) {
        logger.warn('Missing GDPR data, initializing...');
        metrics.gdpr = { score: 0, principles: [] };
      }
      
      // Ensure arrays are initialized (defensive check)
      if (!Array.isArray(metrics.nist.controls)) {
        metrics.nist.controls = [];
      }
      if (!Array.isArray(metrics.owasp.top10)) {
        metrics.owasp.top10 = [];
      }
      if (!Array.isArray(metrics.pci.requirements)) {
        metrics.pci.requirements = [];
      }
      if (!Array.isArray(metrics.gdpr.principles)) {
        metrics.gdpr.principles = [];
      }
      
      logger.info({
        nistControls: metrics.nist?.controls?.length ?? 0,
        owaspRisks: metrics.owasp?.top10?.length ?? 0,
        pciRequirements: metrics.pci?.requirements?.length ?? 0,
        gdprPrinciples: metrics.gdpr?.principles?.length ?? 0,
        metricsKeys: Object.keys(metrics),
      }, 'Compliance metrics validated, sending response');
      
      // Double-check we have a valid metrics object before sending
      if (!metrics || typeof metrics !== 'object') {
        return reply.status(500).send({
          error: {
            code: 'INTERNAL_ERROR',
            message: 'Invalid metrics structure after validation',
          },
        });
      }
      
      const response = { metrics };
      logger.info({ responseKeys: Object.keys(response) }, 'Sending compliance metrics response');
      return reply.send(response);
    } catch (error: any) {
      logger.error({ error, stack: error.stack, message: error.message }, 'Failed to retrieve compliance metrics');
      return reply.status(500).send({
        error: {
          code: 'INTERNAL_ERROR',
          message: error.message || 'Failed to retrieve compliance metrics',
        },
      });
    }
  }
}

