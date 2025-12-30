/**
 * Request ID middleware for distributed tracing
 * Generates or extracts request ID and attaches to request/response
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { getRequestId } from '../lib/requestContext.js';

/**
 * Fastify hook to add request ID to every request
 * Extracts from X-Request-ID header or generates new one
 */
export async function requestIdHook(request: FastifyRequest, reply: FastifyReply) {
  const requestId = getRequestId(request);

  // Attach to request for access in handlers
  (request as any).requestId = requestId;

  // Add to response headers for client-side correlation
  reply.header('X-Request-ID', requestId);
}
