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
 * Extract client IP from request headers
 * Handles various proxy header formats (X-Forwarded-For, X-Real-IP)
 * @param request - Fastify request object
 * @returns Client IP address
 */
export function getClientIp(request: FastifyRequest): string {
  // Check X-Forwarded-For (comma-separated list, first is client)
  const forwardedFor = request.headers['x-forwarded-for'] as string | undefined;
  if (forwardedFor) {
    const ips = forwardedFor.split(',').map((ip) => ip.trim());
    return ips[0];
  }

  // Check X-Real-IP
  const realIp = request.headers['x-real-ip'] as string | undefined;
  if (realIp) {
    return realIp;
  }

  // Fallback to socket IP
  return request.ip;
}

/**
 * Calculate request duration in milliseconds
 * @param context - Request context with start time
 * @returns Duration in ms
 */
export function getRequestDuration(context: RequestContext): number {
  return Date.now() - context.startTime;
}
