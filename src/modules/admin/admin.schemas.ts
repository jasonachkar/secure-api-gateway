/**
 * Admin module schemas and types
 */

import { z } from 'zod';

/**
 * Metrics summary response
 */
export interface MetricsSummary {
  requestsPerSecond: number;
  totalRequests: number;
  activeConnections: number;
  errorRate: number;
  authStats: {
    failedLogins: number;
    successfulLogins: number;
    accountLockouts: number;
    activeSessions: number;
  };
  rateLimitStats: {
    violations: number;
    topViolators: Array<{ ip: string; count: number }>;
  };
  responseTimeStats: {
    p50: number;
    p95: number;
    p99: number;
  };
  systemHealth: {
    redisConnected: boolean;
    uptime: number;
  };
}

/**
 * Real-time metrics stream data
 */
export interface RealtimeMetrics {
  timestamp: number;
  requestsPerSecond: number;
  errorRate: number;
  avgResponseTime: number;
  recentEvents: Array<{
    type: string;
    message: string;
    severity: 'info' | 'warning' | 'error';
    timestamp: number;
  }>;
}

/**
 * Active session info
 */
export interface SessionInfo {
  jti: string;
  userId: string;
  username: string;
  roles: string[];
  createdAt: number;
  expiresAt: number;
  lastUsedAt?: number;
}

/**
 * User with lockout status
 */
export interface UserInfo {
  userId: string;
  username: string;
  roles: string[];
  permissions: string[];
  lockout?: {
    isLocked: boolean;
    attempts: number;
    expiresAt?: number;
  };
}

/**
 * Audit log query params schema
 */
export const auditLogQuerySchema = z.object({
  userId: z.string().optional(),
  eventType: z.string().optional(),
  startTime: z.coerce.number().optional(),
  endTime: z.coerce.number().optional(),
  limit: z.coerce.number().min(1).max(1000).default(100),
  offset: z.coerce.number().min(0).default(0),
});

export type AuditLogQuery = z.infer<typeof auditLogQuerySchema>;

/**
 * Session revoke params
 */
export const sessionRevokeSchema = z.object({
  jti: z.string().min(1),
});

export type SessionRevokeParams = z.infer<typeof sessionRevokeSchema>;

/**
 * User unlock params
 */
export const userUnlockSchema = z.object({
  userId: z.string().min(1),
});

export type UserUnlockParams = z.infer<typeof userUnlockSchema>;
