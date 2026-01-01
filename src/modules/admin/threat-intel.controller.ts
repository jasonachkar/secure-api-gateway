/**
 * Threat Intelligence Controller
 * Handles HTTP requests for threat intelligence endpoints
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { ThreatIntelService } from './threat-intel.service.js';

/**
 * Threat Intelligence Controller
 */
export class ThreatIntelController {
  constructor(private threatIntelService: ThreatIntelService) {}

  /**
   * GET /admin/threats
   * Get all tracked threats
   */
  async getAllThreats(
    request: FastifyRequest<{ Querystring: { limit?: number; includeAbuseIPDB?: boolean } }>,
    reply: FastifyReply
  ) {
    const limit = request.query.limit || 100;
    const includeAbuseIPDB = request.query.includeAbuseIPDB === true;
    const threats = await this.threatIntelService.getAllThreats(limit, includeAbuseIPDB);
    return { threats };
  }

  /**
   * GET /admin/threats/top
   * Get top threats by score
   */
  async getTopThreats(
    request: FastifyRequest<{ Querystring: { limit?: number; includeAbuseIPDB?: boolean } }>,
    reply: FastifyReply
  ) {
    const limit = request.query.limit || 10;
    const includeAbuseIPDB = request.query.includeAbuseIPDB === true;
    const threats = await this.threatIntelService.getTopThreats(limit, includeAbuseIPDB);
    return { threats };
  }

  /**
   * GET /admin/threats/ip/:ip
   * Get threat information for specific IP
   */
  async getIPThreat(
    request: FastifyRequest<{ 
      Params: { ip: string };
      Querystring: { includeAbuseIPDB?: boolean };
    }>,
    reply: FastifyReply
  ) {
    const includeAbuseIPDB = request.query.includeAbuseIPDB === true;
    const threat = await this.threatIntelService.getIPThreat(request.params.ip, includeAbuseIPDB);
    if (!threat) {
      return reply.code(404).send({
        error: {
          code: 'NOT_FOUND',
          message: 'No threat data found for this IP address',
        },
      });
    }
    return { threat };
  }

  /**
   * GET /admin/threats/statistics
   * Get threat statistics
   */
  async getStatistics(request: FastifyRequest, reply: FastifyReply) {
    const stats = await this.threatIntelService.getStatistics();
    return { statistics: stats };
  }

  /**
   * GET /admin/threats/patterns
   * Detect attack patterns
   */
  async getAttackPatterns(request: FastifyRequest, reply: FastifyReply) {
    const patterns = await this.threatIntelService.detectAttackPatterns();
    return { patterns };
  }

  /**
   * POST /admin/threats/ip/:ip/block
   * Block an IP address
   */
  async blockIP(
    request: FastifyRequest<{
      Params: { ip: string };
      Body: { reason: string };
    }>,
    reply: FastifyReply
  ) {
    const user = (request as any).user;
    await this.threatIntelService.blockIP(
      request.params.ip,
      user.username,
      request.body.reason || 'Manual block'
    );
    return { message: 'IP address blocked successfully' };
  }

  /**
   * POST /admin/threats/ip/:ip/unblock
   * Unblock an IP address
   */
  async unblockIP(
    request: FastifyRequest<{ Params: { ip: string } }>,
    reply: FastifyReply
  ) {
    await this.threatIntelService.unblockIP(request.params.ip);
    return { message: 'IP address unblocked successfully' };
  }

  /**
   * GET /admin/threats/blocked
   * Get all blocked IPs
   */
  async getBlockedIPs(request: FastifyRequest, reply: FastifyReply) {
    const blockedIPs = await this.threatIntelService.getBlockedIPs();
    return { blockedIPs };
  }
}
