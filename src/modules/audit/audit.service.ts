/**
 * Audit logging service
 * Records security-relevant events
 */

import { nanoid } from 'nanoid';
import { AuditLogEntry, AuditEventType } from './audit.types.js';
import { FileAuditStore, RedisAuditStore } from './audit.store.js';
import { GENESIS_HASH, computeEntryHash, verifyEntryChain, type ChainVerificationResult } from './audit.hash.js';
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
   * Chains the new entry to the previous one (see audit.hash.ts) so tampering
   * with any past entry is detectable via verifyChain().
   */
  async log(event: Omit<AuditLogEntry, 'id' | 'timestamp' | 'hash' | 'prevHash'>): Promise<void> {
    const prevHash = (await this.store.getLastHash()) ?? GENESIS_HASH;
    const unhashed: Omit<AuditLogEntry, 'hash'> = {
      id: nanoid(),
      timestamp: Date.now(),
      ...event,
      prevHash,
    };
    const entry: AuditLogEntry = { ...unhashed, hash: computeEntryHash(unhashed) };

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

  /**
   * Verify the tamper-evident hash chain across the retained audit log (see audit.hash.ts).
   * Always walks the unfiltered global chain - a per-user query is a subset view and
   * doesn't have valid prevHash linkage on its own.
   */
  async verifyChain(limit = 10000): Promise<ChainVerificationResult> {
    const newestFirst = await this.store.query({ limit });
    const chronological = [...newestFirst].reverse();
    return verifyEntryChain(chronological);
  }
}
