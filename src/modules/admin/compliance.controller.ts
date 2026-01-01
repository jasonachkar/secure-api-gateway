/**
 * Compliance Controller
 * HTTP handlers for compliance and security posture
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { ComplianceService } from './compliance.service.js';

export class ComplianceController {
  constructor(private complianceService: ComplianceService) {}

  /**
   * GET /admin/compliance/posture
   * Get security posture score
   */
  async getSecurityPosture(request: FastifyRequest, reply: FastifyReply) {
    const posture = await this.complianceService.calculateSecurityPosture();
    reply.send({ posture });
  }

  /**
   * GET /admin/compliance/metrics
   * Get compliance metrics for various frameworks
   */
  async getComplianceMetrics(request: FastifyRequest, reply: FastifyReply) {
    const metrics = await this.complianceService.getComplianceMetrics();
    reply.send({ metrics });
  }
}

