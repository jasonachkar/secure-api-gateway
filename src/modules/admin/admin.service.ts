/**
 * Admin service
 * Handles session management, user administration, and audit log queries
 */

import Redis from 'ioredis';
import { TokenStore } from '../auth/token.store.js';
import { AuditService } from '../audit/audit.service.js';
import { logger } from '../../lib/logger.js';
import type { SessionInfo, UserInfo, AuditLogQuery } from './admin.schemas.js';
import type { AuditLogEntry } from '../audit/audit.types.js';
import type { RefreshTokenMetadata } from '../../types/index.js';
import { env } from '../../config/index.js';

/**
 * Demo user store interface (mirrors auth service)
 */
interface User {
  userId: string;
  username: string;
  roles: string[];
  permissions: string[];
}

/**
 * Admin service for dashboard operations
 */
export class AdminService {
  private tokenStore: TokenStore;
  private lockoutPrefix = 'lockout';

  // Demo users (should match auth.service.ts)
  private demoUsers: User[] = [
    {
      userId: 'user-1',
      username: 'admin',
      roles: ['admin', 'user'],
      permissions: [
        'read:reports',
        'write:reports',
        'delete:reports',
        'read:admin',
        'write:admin',
        'manage:users',
      ],
    },
    {
      userId: 'user-2',
      username: 'user',
      roles: ['user'],
      permissions: ['read:reports'],
    },
    {
      userId: 'user-3',
      username: 'service',
      roles: ['service'],
      permissions: ['read:reports', 'write:reports'],
    },
  ];

  constructor(
    private redis: Redis,
    private auditService: AuditService
  ) {
    this.tokenStore = new TokenStore(redis);
  }

  /**
   * Get all active sessions
   */
  async getActiveSessions(): Promise<SessionInfo[]> {
    try {
      // Find all token keys (exclude blacklist and family keys)
      const keys = await this.redis.keys('token:*');
      const tokenKeys = keys.filter(key => !key.includes('blacklist') && !key.includes('family'));

      const sessions: SessionInfo[] = [];

      for (const key of tokenKeys) {
        const jti = key.split(':')[1];
        const metadata = await this.tokenStore.get(jti);

        if (metadata) {
          sessions.push({
            jti: metadata.jti,
            userId: metadata.userId,
            username: metadata.username,
            roles: metadata.roles,
            createdAt: metadata.createdAt,
            expiresAt: metadata.expiresAt,
            lastUsedAt: metadata.lastUsedAt,
          });
        }
      }

      // Sort by creation time (newest first)
      sessions.sort((a, b) => b.createdAt - a.createdAt);

      return sessions;
    } catch (error) {
      logger.error({ error }, 'Failed to get active sessions');
      throw error;
    }
  }

  /**
   * Revoke a session by JTI
   */
  async revokeSession(jti: string): Promise<void> {
    try {
      await this.tokenStore.revoke(jti, 60 * 60 * 24 * 7); // 7 days blacklist
      logger.info({ jti }, 'Session revoked by admin');
    } catch (error) {
      logger.error({ error, jti }, 'Failed to revoke session');
      throw error;
    }
  }

  /**
   * Get all users with lockout status
   */
  async getUsers(): Promise<UserInfo[]> {
    try {
      const users: UserInfo[] = [];

      for (const user of this.demoUsers) {
        const lockoutKey = `${this.lockoutPrefix}:${user.username}`;
        const attempts = await this.redis.get(lockoutKey);
        const attemptCount = attempts ? parseInt(attempts, 10) : 0;
        const isLocked = attemptCount >= env.MAX_LOGIN_ATTEMPTS;

        let expiresAt: number | undefined;
        if (isLocked) {
          const ttl = await this.redis.ttl(lockoutKey);
          if (ttl > 0) {
            expiresAt = Date.now() + ttl * 1000;
          }
        }

        users.push({
          userId: user.userId,
          username: user.username,
          roles: user.roles,
          permissions: user.permissions,
          lockout: {
            isLocked,
            attempts: attemptCount,
            expiresAt,
          },
        });
      }

      return users;
    } catch (error) {
      logger.error({ error }, 'Failed to get users');
      throw error;
    }
  }

  /**
   * Unlock a user account (clear lockout)
   */
  async unlockUser(userId: string): Promise<void> {
    try {
      // Find user by ID
      const user = this.demoUsers.find(u => u.userId === userId);
      if (!user) {
        throw new Error('User not found');
      }

      // Clear lockout for all IPs (in production, might want to be more specific)
      const lockoutKeys = await this.redis.keys(`${this.lockoutPrefix}:${user.username}:*`);
      const mainLockoutKey = `${this.lockoutPrefix}:${user.username}`;

      if (lockoutKeys.length > 0) {
        await this.redis.del(...lockoutKeys, mainLockoutKey);
      } else {
        await this.redis.del(mainLockoutKey);
      }

      logger.info({ userId, username: user.username }, 'User account unlocked by admin');
    } catch (error) {
      logger.error({ error, userId }, 'Failed to unlock user');
      throw error;
    }
  }

  /**
   * Query audit logs
   */
  async queryAuditLogs(query: AuditLogQuery): Promise<AuditLogEntry[]> {
    try {
      const logs = await this.auditService.query({
        userId: query.userId,
        eventType: query.eventType,
        startTime: query.startTime,
        endTime: query.endTime,
        limit: query.limit,
      });

      // Apply offset (simple pagination)
      return logs.slice(query.offset, query.offset + query.limit);
    } catch (error) {
      logger.error({ error }, 'Failed to query audit logs');
      throw error;
    }
  }
}
