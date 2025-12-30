/**
 * Audit logging service
 * Records security-relevant events
 */

import { nanoid } from 'nanoid';
import { AuditLogEntry, AuditEventType } from './audit.types.js';
import { FileAuditStore, RedisAuditStore } from './audit.store.js';
import { logger } from '../../lib/logger.js';

/**
 * Audit service
 */
export class AuditService {
  constructor(private store: FileAuditStore | RedisAuditStore) {}

  /**
   * Initialize service
   */
  async initialize() {
    await this.store.initialize();
  }

  /**
   * Log an audit event
   */
  async log(event: Omit<AuditLogEntry, 'id' | 'timestamp'>): Promise<void> {
    const entry: AuditLogEntry = {
      id: nanoid(),
      timestamp: Date.now(),
      ...event,
    };

    try {
      await this.store.append(entry);

      // Also log to application logger for aggregation
      logger.info(
        {
          audit: true,
          ...entry,
        },
        `Audit: ${entry.eventType}`
      );
    } catch (error) {
      // Don't let audit failures break the application
      logger.error({ error, event }, 'Failed to write audit log');
    }
  }

  /**
   * Helper: Log login success
   */
  async logLoginSuccess(params: {
    userId: string;
    username: string;
    ip: string;
    requestId: string;
  }): Promise<void> {
    await this.log({
      eventType: AuditEventType.LOGIN_SUCCESS,
      userId: params.userId,
      username: params.username,
      ip: params.ip,
      requestId: params.requestId,
      success: true,
      message: 'User logged in successfully',
    });
  }

  /**
   * Helper: Log login failure
   */
  async logLoginFailure(params: {
    username: string;
    ip: string;
    requestId: string;
    reason?: string;
  }): Promise<void> {
    await this.log({
      eventType: AuditEventType.LOGIN_FAILURE,
      username: params.username,
      ip: params.ip,
      requestId: params.requestId,
      success: false,
      message: params.reason || 'Login failed',
    });
  }

  /**
   * Helper: Log permission denied
   */
  async logPermissionDenied(params: {
    userId?: string;
    username?: string;
    ip: string;
    requestId: string;
    resource?: string;
    action?: string;
    requiredPermission?: string;
  }): Promise<void> {
    await this.log({
      eventType: AuditEventType.PERMISSION_DENIED,
      userId: params.userId,
      username: params.username,
      ip: params.ip,
      requestId: params.requestId,
      resource: params.resource,
      action: params.action,
      success: false,
      message: 'Permission denied',
      metadata: params.requiredPermission
        ? { requiredPermission: params.requiredPermission }
        : undefined,
    });
  }

  /**
   * Helper: Log rate limit exceeded
   */
  async logRateLimitExceeded(params: {
    userId?: string;
    ip: string;
    requestId: string;
    resource?: string;
  }): Promise<void> {
    await this.log({
      eventType: AuditEventType.RATE_LIMIT_EXCEEDED,
      userId: params.userId,
      ip: params.ip,
      requestId: params.requestId,
      resource: params.resource,
      success: false,
      message: 'Rate limit exceeded',
    });
  }

  /**
   * Query audit logs
   */
  async query(filters: {
    userId?: string;
    eventType?: string;
    startTime?: number;
    endTime?: number;
    limit?: number;
  }): Promise<AuditLogEntry[]> {
    return this.store.query(filters);
  }
}
