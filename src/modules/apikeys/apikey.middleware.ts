/**
 * API key authentication/authorization middleware
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { ApiKeyStore } from './apikey.store.js';
import { UnauthorizedError, ForbiddenError } from '../../lib/errors.js';
import { getClientIp, getRequestId } from '../../lib/requestContext.js';
import { AuditEventType } from '../audit/audit.types.js';
import { logger } from '../../lib/logger.js';
import type { ApiKeyContext } from './apikey.types.js';

function extractApiKey(request: FastifyRequest): string | null {
  const header = request.headers['x-api-key'];
  return typeof header === 'string' && header.length > 0 ? header : null;
}

async function auditApiKeyEvent(
  request: FastifyRequest,
  eventType: AuditEventType,
  success: boolean,
  message: string,
  apiKeyId?: string
): Promise<void> {
  const auditService = (request.server as any).audit;
  if (!auditService) {
    return;
  }

  try {
    await auditService.log({
      eventType,
      ip: getClientIp(request),
      requestId: getRequestId(request),
      resource: request.url,
      action: request.method,
      success,
      message,
      metadata: apiKeyId ? { apiKeyId } : undefined,
    });
  } catch (error) {
    logger.error({ error }, 'Failed to log API key event to audit service');
  }
}

/**
 * Validates the X-API-Key header if one is present. Unlike requireApiKey, a
 * missing header is not an error - this lets a route accept either a JWT
 * (via requireAuth/optionalAuth) or an API key on the same endpoint. If a key
 * IS presented, it must be valid; we don't silently ignore a bad key.
 */
export function createOptionalApiKeyAuth(store: ApiKeyStore) {
  return async function optionalApiKeyAuth(request: FastifyRequest, _reply: FastifyReply) {
    const rawKey = extractApiKey(request);
    if (!rawKey) {
      return;
    }

    const record = await store.findByRawKey(rawKey);

    if (!record || !store.isUsable(record)) {
      logger.warn({ url: request.url }, 'Invalid or revoked API key presented');
      await auditApiKeyEvent(request, AuditEventType.APIKEY_INVALID, false, 'Invalid or revoked API key', record?.id);
      throw new UnauthorizedError('Invalid API key', 'API_KEY_INVALID');
    }

    await store.touchLastUsed(record.id);

    const context: ApiKeyContext = { id: record.id, name: record.name, scopes: record.scopes };
    (request as any).apiKey = context;

    await auditApiKeyEvent(request, AuditEventType.APIKEY_USED, true, 'API key authenticated', record.id);
  };
}

/**
 * Requires a valid API key - use for endpoints that are exclusively machine-to-machine.
 */
export function createRequireApiKey(store: ApiKeyStore) {
  const optional = createOptionalApiKeyAuth(store);

  return async function requireApiKey(request: FastifyRequest, reply: FastifyReply) {
    if (!extractApiKey(request)) {
      throw new UnauthorizedError('Missing API key');
    }
    await optional(request, reply);
  };
}

/**
 * Requires the authenticated API key to carry a specific scope.
 * Use after createRequireApiKey/createOptionalApiKeyAuth in the preHandler chain.
 */
export function requireApiKeyScope(scope: string) {
  return async (request: FastifyRequest) => {
    const apiKey = (request as any).apiKey as ApiKeyContext | undefined;

    if (!apiKey) {
      throw new UnauthorizedError('API key authentication required');
    }

    if (!apiKey.scopes.includes(scope)) {
      logger.warn({ apiKeyId: apiKey.id, scope, apiKeyScopes: apiKey.scopes }, 'API key missing required scope');
      throw new ForbiddenError(`API key missing required scope: ${scope}`, scope);
    }
  };
}
