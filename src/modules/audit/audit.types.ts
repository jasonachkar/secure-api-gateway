/**
 * Audit log type definitions
 */

/**
 * Audit event types
 */
export enum AuditEventType {
  LOGIN_SUCCESS = 'LOGIN_SUCCESS',
  LOGIN_FAILURE = 'LOGIN_FAILURE',
  LOGOUT = 'LOGOUT',
  TOKEN_REFRESH = 'TOKEN_REFRESH',
  TOKEN_REVOKED = 'TOKEN_REVOKED',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  ACCOUNT_LOCKED = 'ACCOUNT_LOCKED',
  SSRF_BLOCKED = 'SSRF_BLOCKED',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
}

/**
 * Audit log entry
 */
export interface AuditLogEntry {
  id: string;
  timestamp: number;
  eventType: AuditEventType;
  userId?: string;
  username?: string;
  ip: string;
  requestId: string;
  resource?: string;
  action?: string;
  success: boolean;
  message?: string;
  metadata?: Record<string, unknown>;
}
