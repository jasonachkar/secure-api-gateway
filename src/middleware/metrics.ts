/**
 * Metrics collection middleware
 * Automatically records request metrics for the security dashboard
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { MetricsService } from '../modules/admin/metrics.service.js';
import { getClientIp } from '../lib/requestContext.js';
import { logger } from '../lib/logger.js';

/**
 * Register metrics collection hooks
 * Automatically tracks all requests for the dashboard
 */
export async function registerMetricsCollection(
  app: FastifyInstance,
  metricsService: MetricsService
) {
  // Track request start time
  app.addHook('onRequest', async (request, reply) => {
    (request as any).startTime = Date.now();
  });

  // Record metrics after response is sent
  app.addHook('onResponse', async (request, reply) => {
    const startTime = (request as any).startTime || Date.now();
    const responseTime = Date.now() - startTime;
    const user = (request as any).user;

    try {
      await metricsService.recordRequest({
        method: request.method,
        path: request.url,
        statusCode: reply.statusCode,
        responseTime,
        userId: user?.userId,
        ip: getClientIp(request),
      });
    } catch (error) {
      // Don't let metrics failures affect the request
      logger.debug({ error }, 'Failed to record request metrics');
    }
  });

  logger.info('Metrics collection middleware registered');
}
