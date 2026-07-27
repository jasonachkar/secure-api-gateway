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
 * Extract client IP for every security control that needs one (rate limiting, account
 * lockout, IP blocking, threat scoring, audit evidence, guided scenarios). This is the
 * single shared resolver - nothing else in the app should read
 * `x-forwarded-for`/`x-real-ip` directly.
 *
 * Trust model: `request.ip` is computed by Fastify from the explicit proxy trust
 * configuration (see lib/proxyTrust.ts + docs/PROXY_TRUST.md), not by trusting every
 * direct client's headers. A client that isn't behind a trusted proxy hop can send any
 * `X-Forwarded-For` it likes - Fastify simply won't use it. The fallback below only
 * covers the (practically unreachable outside tests) case where `request.ip` is empty;
 * it reads the raw socket peer address, never a header, so it can't be spoofed either.
 */
export function getClientIp(request: FastifyRequest): string {
  if (request.ip && request.ip.trim().length > 0) {
    return request.ip.trim();
  }

  return request.socket.remoteAddress?.trim() || '0.0.0.0';
}

/**
 * Calculate request duration in milliseconds
 * @param context - Request context with start time
 * @returns Duration in ms
 */
export function getRequestDuration(context: RequestContext): number {
  return Date.now() - context.startTime;
}
