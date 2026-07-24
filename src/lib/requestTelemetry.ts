/**
 * In-memory ring buffer of recent requests, powering the dashboard's "Request Inspector"
 * live log (GET /admin/requests/live). Per-instance only - if the gateway scales to
 * multiple replicas each has its own buffer, which is fine for a live-tail view (it's not
 * an audit record; the tamper-evident audit log already covers that need durably).
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { AuthUser } from '../types/index.js';

export interface RequestLogEntry {
  timestamp: number;
  method: string;
  path: string;
  user: string;
  rbacDecision: 'allowed' | 'denied' | 'anonymous';
  rateLimitRemaining: number | null;
  statusCode: number;
  latencyMs: number;
}

const MAX_ENTRIES = 200;
const buffer: RequestLogEntry[] = [];

function recordRequest(entry: RequestLogEntry): void {
  buffer.push(entry);
  if (buffer.length > MAX_ENTRIES) {
    buffer.shift();
  }
}

/** Newest-first, capped at `limit`. */
export function getRecentRequests(limit = 20): RequestLogEntry[] {
  return buffer.slice(-limit).reverse();
}

const SKIP_PATHS = ['/healthz', '/readyz', '/admin/requests/live', '/admin/metrics/realtime'];

/**
 * Registers a global onRequest/onResponse hook pair that captures method/path/user/
 * RBAC-decision/rate-limit-remaining/status/latency for every request, without touching
 * business logic in the route handlers themselves. Route-level auth/RBAC/rate-limit
 * preHandlers all run before onResponse, so their state (request.user, the rbacDecision
 * flag rbac.ts sets on denial, and the RateLimit-Remaining header) is already present by
 * the time this hook reads it.
 */
export function registerRequestTelemetry(app: FastifyInstance): void {
  app.addHook('onRequest', async (request: FastifyRequest) => {
    (request as any).telemetryStartTime = Date.now();
  });

  app.addHook('onResponse', async (request: FastifyRequest, reply: FastifyReply) => {
    if (SKIP_PATHS.some((path) => request.url.startsWith(path))) {
      return;
    }

    const start = (request as any).telemetryStartTime as number | undefined;
    const user = (request as any).user as AuthUser | undefined;
    const rbacDecision = (request as any).rbacDecision as 'denied' | undefined;
    const remainingHeader = reply.getHeader('x-ratelimit-remaining');

    recordRequest({
      timestamp: Date.now(),
      method: request.method,
      path: request.routeOptions?.url ?? request.url,
      user: user ? `${user.username} (${user.roles[0] ?? 'user'})` : 'anonymous',
      rbacDecision: rbacDecision === 'denied' ? 'denied' : user ? 'allowed' : 'anonymous',
      rateLimitRemaining:
        typeof remainingHeader === 'string' || typeof remainingHeader === 'number'
          ? Number(remainingHeader)
          : null,
      statusCode: reply.statusCode,
      latencyMs: start ? Date.now() - start : 0,
    });
  });
}
