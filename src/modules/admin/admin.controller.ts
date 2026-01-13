/**
 * Admin controller
 * Handles HTTP requests for admin dashboard endpoints
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { AdminService } from './admin.service.js';
import { MetricsService } from './metrics.service.js';
import type {
  AdminAuditLogQuery,
  AuditLogQuery,
  SessionRevokeParams,
  UserUnlockParams,
} from './admin.schemas.js';
import { AdminAuditLogService } from './audit-log.service.js';

/**
 * Admin controller
 */
export class AdminController {
  constructor(
    private adminService: AdminService,
    private metricsService: MetricsService,
    private adminAuditLogService: AdminAuditLogService
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
   * GET /admin/metrics/ingestion
   * Get ingestion status for connected data sources
   */
  async getIngestionStatus(request: FastifyRequest, reply: FastifyReply) {
    return this.metricsService.getIngestionStatus();
  }

  /**
   * GET /admin/metrics/realtime
   * SSE stream of real-time metrics
   */
  async streamRealtimeMetrics(request: FastifyRequest, reply: FastifyReply) {
    // Get origin from request - allow all origins
    const origin = request.headers.origin || '*';
    
    // Set SSE headers BEFORE writing any data
    reply.raw.setHeader('Content-Type', 'text/event-stream');
    reply.raw.setHeader('Cache-Control', 'no-cache');
    reply.raw.setHeader('Connection', 'keep-alive');
    reply.raw.setHeader('X-Accel-Buffering', 'no'); // Disable Nginx buffering
    
    // CORS headers for SSE - allow all origins
    reply.raw.setHeader('Access-Control-Allow-Origin', origin);
    reply.raw.setHeader('Access-Control-Allow-Credentials', 'true');
    reply.raw.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    reply.raw.setHeader('Access-Control-Allow-Headers', 'Cache-Control, Content-Type, Authorization, Accept');
    
    // Send headers immediately
    reply.raw.flushHeaders();

    // Send initial connection message
    try {
      reply.raw.write('data: {"type":"connected"}\n\n');
    } catch (error) {
      // Client already disconnected
      return;
    }

    let isClosed = false;

    // Stream metrics every 2 seconds
    const interval = setInterval(async () => {
      if (isClosed) {
        clearInterval(interval);
        return;
      }

      try {
        const metrics = await this.metricsService.getRealtimeMetrics();
        if (!isClosed && !reply.raw.destroyed) {
          const data = `data: ${JSON.stringify(metrics)}\n\n`;
          reply.raw.write(data);
        }
      } catch (error) {
        // Log error but don't close connection
        if (!isClosed && !reply.raw.destroyed) {
          try {
            reply.raw.write(`data: ${JSON.stringify({ error: 'Failed to get metrics', timestamp: Date.now() })}\n\n`);
          } catch (writeError) {
            // Connection already closed
            isClosed = true;
            clearInterval(interval);
          }
        }
      }
    }, 2000);

    // Clean up on client disconnect
    request.raw.on('close', () => {
      isClosed = true;
      clearInterval(interval);
      if (!reply.raw.destroyed) {
        reply.raw.end();
      }
    });

    // Handle errors
    request.raw.on('error', () => {
      isClosed = true;
      clearInterval(interval);
    });

    // Keep connection alive with heartbeat
    const heartbeat = setInterval(() => {
      if (!isClosed) {
        try {
          reply.raw.write(': heartbeat\n\n');
        } catch (error) {
          isClosed = true;
          clearInterval(interval);
          clearInterval(heartbeat);
        }
      }
    }, 30000); // Every 30 seconds

    // Clean up heartbeat on close
    request.raw.on('close', () => {
      clearInterval(heartbeat);
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
   * GET /admin/audit/admin-actions
   * Query admin action logs
   */
  async getAdminActionLogs(
    request: FastifyRequest<{ Querystring: AdminAuditLogQuery }>,
    reply: FastifyReply
  ) {
    const logs = await this.adminAuditLogService.query(request.query);
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

  /**
   * GET /admin/config
   * Get runtime configuration flags
   */
  async getConfig(request: FastifyRequest, reply: FastifyReply) {
    return {
      demoMode: env.DEMO_MODE,
    };
  }
}
