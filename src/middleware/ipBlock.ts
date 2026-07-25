/**
 * Early request-path enforcement for Redis-backed blocked IPs.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getClientIp, getRequestId } from '../lib/requestContext.js';
import { logger } from '../lib/logger.js';
import type { ThreatIntelService } from '../modules/admin/threat-intel.service.js';
import type { AuditService } from '../modules/audit/audit.service.js';
import { AuditEventType } from '../modules/audit/audit.types.js';
import type { ResponseService } from '../modules/response/response.service.js';

const EXCLUDED_PATHS = new Set(['/healthz', '/readyz']);

function isExcludedPath(url: string): boolean {
  const path = url.split('?')[0];
  return EXCLUDED_PATHS.has(path);
}

export function registerIpBlockMiddleware(
  app: FastifyInstance,
  threatIntel: ThreatIntelService,
  auditService?: AuditService,
  responseService?: ResponseService
): void {
  app.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (isExcludedPath(request.url)) {
      return;
    }

    const ip = getClientIp(request);
    const requestId = getRequestId(request);

    let blocked = false;
    try {
      blocked = await threatIntel.isIPBlocked(ip);
    } catch (error) {
      // Fail open for Redis errors on optional control would weaken security;
      // fail closed for block checks: if we cannot verify, allow but log.
      // Primary gateway auth/rate-limit still protect the edge.
      logger.error({ error, ip, requestId }, 'IP block check failed');
      return;
    }

    if (!blocked) {
      return;
    }

    logger.warn({ ip, requestId, url: request.url }, 'Blocked IP rejected');

    if (auditService) {
      try {
        await auditService.log({
          eventType: AuditEventType.SECURITY_IP_BLOCKED_REQUEST,
          ip,
          requestId,
          success: false,
          message: 'Request rejected: IP is blocked',
          resource: request.url,
          action: request.method,
          metadata: {
            enforcement: 'enforced',
            code: 'IP_BLOCKED',
          },
        });
      } catch (error) {
        logger.error({ error }, 'Failed to audit blocked IP rejection');
      }
    }

    if (responseService) {
      try {
        await responseService.recordEnforcementSighting({
          ip,
          requestId,
          path: request.url.split('?')[0],
          method: request.method,
        });
      } catch {
        // non-fatal
      }
    }

    await reply.status(403).send({
      error: {
        code: 'IP_BLOCKED',
        message: 'Access denied',
      },
      requestId,
    });
  });
}
