/**
 * Admin controller
 * Handles HTTP requests for admin dashboard endpoints
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { AdminService } from './admin.service.js';
import { MetricsService } from './metrics.service.js';
import type { AuditLogQuery, SessionRevokeParams, UserUnlockParams } from './admin.schemas.js';

/**
 * Admin controller
 */
export class AdminController {
  constructor(
    private adminService: AdminService,
    private metricsService: MetricsService
  ) {}

  /**
   * GET /admin/metrics/summary
   * Get current metrics summary
   */
  async getMetricsSummary(request: FastifyRequest, reply: FastifyReply) {
    const summary = await this.metricsService.getSummary();
    return summary;
  }

  /**
   * GET /admin/metrics/realtime
   * SSE stream of real-time metrics
   */
  async streamRealtimeMetrics(request: FastifyRequest, reply: FastifyReply) {
    // Set SSE headers
    reply.raw.setHeader('Content-Type', 'text/event-stream');
    reply.raw.setHeader('Cache-Control', 'no-cache');
    reply.raw.setHeader('Connection', 'keep-alive');
    reply.raw.setHeader('X-Accel-Buffering', 'no'); // Disable Nginx buffering

    // Send initial connection message
    reply.raw.write('data: {"type":"connected"}\n\n');

    // Stream metrics every 2 seconds
    const interval = setInterval(async () => {
      try {
        const metrics = await this.metricsService.getRealtimeMetrics();
        reply.raw.write(`data: ${JSON.stringify(metrics)}\n\n`);
      } catch (error) {
        clearInterval(interval);
        reply.raw.end();
      }
    }, 2000);

    // Clean up on client disconnect
    request.raw.on('close', () => {
      clearInterval(interval);
      reply.raw.end();
    });
  }

  /**
   * GET /admin/audit/logs
   * Query audit logs
   */
  async getAuditLogs(
    request: FastifyRequest<{ Querystring: AuditLogQuery }>,
    reply: FastifyReply
  ) {
    const logs = await this.adminService.queryAuditLogs(request.query);
    return { logs };
  }

  /**
   * GET /admin/sessions/active
   * Get all active sessions
   */
  async getActiveSessions(request: FastifyRequest, reply: FastifyReply) {
    const sessions = await this.adminService.getActiveSessions();
    return { sessions };
  }

  /**
   * POST /admin/sessions/:jti/revoke
   * Revoke a session
   */
  async revokeSession(
    request: FastifyRequest<{ Params: SessionRevokeParams }>,
    reply: FastifyReply
  ) {
    await this.adminService.revokeSession(request.params.jti);
    return { message: 'Session revoked successfully' };
  }

  /**
   * GET /admin/users
   * Get all users with lockout status
   */
  async getUsers(request: FastifyRequest, reply: FastifyReply) {
    const users = await this.adminService.getUsers();
    return { users };
  }

  /**
   * POST /admin/users/:userId/unlock
   * Unlock a user account
   */
  async unlockUser(
    request: FastifyRequest<{ Params: UserUnlockParams }>,
    reply: FastifyReply
  ) {
    await this.adminService.unlockUser(request.params.userId);
    return { message: 'User unlocked successfully' };
  }

  /**
   * GET /admin/health
   * System health check
   */
  async getHealth(request: FastifyRequest, reply: FastifyReply) {
    const summary = await this.metricsService.getSummary();
    return {
      status: 'healthy',
      uptime: summary.systemHealth.uptime,
      redis: summary.systemHealth.redisConnected ? 'connected' : 'disconnected',
      timestamp: Date.now(),
    };
  }
}
