/**
 * Request context utilities for correlation and tracing
 * Implements request ID generation and propagation for distributed tracing
 */

import { nanoid } from 'nanoid';
import { FastifyRequest } from 'fastify';

/**
 * Request context interface
 * Contains correlation data propagated through the request lifecycle
 */
export interface RequestContext {
  requestId: string;
  userId?: string;
  roles?: string[];
  permissions?: string[];
  ip?: string;
  userAgent?: string;
  startTime: number;
}

/**
 * Generate a unique request ID
 * Uses nanoid for URL-safe, collision-resistant IDs
 * @returns Request ID string
 */
export function generateRequestId(): string {
  return nanoid(21); // 21 chars = ~118 bits of entropy (very low collision probability)
}

/**
 * Extract or generate request ID from request headers
 * Supports X-Request-ID header for tracing across services
 * @param request - Fastify request object
 * @returns Request ID
 */
export function getRequestId(request: FastifyRequest): string {
  // Check for existing request ID from upstream (e.g., load balancer, API gateway)
  const existingId = request.headers['x-request-id'] as string | undefined;

  // Use existing or generate new
  return existingId || generateRequestId();
}

/**
 * Create request context from Fastify request
 * Extracts relevant data for logging and tracing
 * @param request - Fastify request object
 * @returns Request context
 */
export function createRequestContext(request: FastifyRequest): RequestContext {
  return {
    requestId: getRequestId(request),
    userId: (request as any).user?.userId, // Set by auth middleware
    roles: (request as any).user?.roles,
    permissions: (request as any).user?.permissions,
    ip: getClientIp(request),
    userAgent: request.headers['user-agent'],
    startTime: Date.now(),
  };
}

/**
 * Extract client IP for security controls (rate limit, IP block, audit).
 *
 * Trust model: with `trustProxy: true`, Fastify derives `request.ip` from the
 * socket peer and trusted forwarding hops. Spoofed `X-Forwarded-For` from a
 * direct client must not override that identity for enforcement decisions.
 * We therefore prefer `request.ip` and only fall back to raw headers when
 * `request.ip` is unavailable.
 */
export function getClientIp(request: FastifyRequest): string {
  if (request.ip && request.ip.trim().length > 0) {
    return request.ip.trim();
  }

  const realIp = request.headers['x-real-ip'];
  if (typeof realIp === 'string' && realIp.trim()) {
    return realIp.trim();
  }

  const forwardedFor = request.headers['x-forwarded-for'];
  if (typeof forwardedFor === 'string' && forwardedFor.trim()) {
    return forwardedFor.split(',')[0]?.trim() || '0.0.0.0';
  }

  return '0.0.0.0';
}

/**
 * Calculate request duration in milliseconds
 * @param context - Request context with start time
 * @returns Duration in ms
 */
export function getRequestDuration(context: RequestContext): number {
  return Date.now() - context.startTime;
}
