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
  APIKEY_CREATED = 'APIKEY_CREATED',
  APIKEY_REVOKED = 'APIKEY_REVOKED',
  APIKEY_USED = 'APIKEY_USED',
  APIKEY_INVALID = 'APIKEY_INVALID',
  SECURITY_IP_BLOCKED_REQUEST = 'SECURITY_IP_BLOCKED_REQUEST',
  SECURITY_RESPONSE_ACTION = 'SECURITY_RESPONSE_ACTION',
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
  /** SHA-256 hash of the previous entry in the log - forms the tamper-evident chain */
  prevHash: string;
  /** SHA-256 hash of this entry's own contents (including prevHash) */
  hash: string;
}
