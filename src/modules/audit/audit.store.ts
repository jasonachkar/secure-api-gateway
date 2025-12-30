/**
 * Audit log storage
 * Supports file-based storage for development and Redis for production
 */

import { writeFile, readFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { AuditLogEntry } from './audit.types.js';
import { logger } from '../../lib/logger.js';
import Redis from 'ioredis';

/**
 * File-based audit log store
 */
export class FileAuditStore {
  private logFile: string;

  constructor(logPath: string = './logs/audit-logs.json') {
    this.logFile = logPath;
  }

  /**
   * Initialize store (create log directory)
   */
  async initialize() {
    const dir = path.dirname(this.logFile);
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }

    // Create empty array if file doesn't exist
    if (!existsSync(this.logFile)) {
      await writeFile(this.logFile, JSON.stringify([], null, 2));
    }

    logger.info({ logFile: this.logFile }, 'File audit store initialized');
  }

  /**
   * Append audit log entry
   */
  async append(entry: AuditLogEntry): Promise<void> {
    try {
      // Read existing logs
      const content = await readFile(this.logFile, 'utf-8');
      const logs: AuditLogEntry[] = JSON.parse(content);

      // Append new entry
      logs.push(entry);

      // Keep only last 10000 entries to prevent unbounded growth
      const trimmed = logs.slice(-10000);

      // Write back
      await writeFile(this.logFile, JSON.stringify(trimmed, null, 2));
    } catch (error) {
      logger.error({ error }, 'Failed to write audit log to file');
      throw error;
    }
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
    try {
      const content = await readFile(this.logFile, 'utf-8');
      let logs: AuditLogEntry[] = JSON.parse(content);

      // Apply filters
      if (filters.userId) {
        logs = logs.filter((log) => log.userId === filters.userId);
      }

      if (filters.eventType) {
        logs = logs.filter((log) => log.eventType === filters.eventType);
      }

      if (filters.startTime) {
        logs = logs.filter((log) => log.timestamp >= filters.startTime!);
      }

      if (filters.endTime) {
        logs = logs.filter((log) => log.timestamp <= filters.endTime!);
      }

      // Sort by timestamp descending (newest first)
      logs.sort((a, b) => b.timestamp - a.timestamp);

      // Apply limit
      if (filters.limit) {
        logs = logs.slice(0, filters.limit);
      }

      return logs;
    } catch (error) {
      logger.error({ error }, 'Failed to query audit logs');
      return [];
    }
  }
}

/**
 * Redis-based audit log store (for distributed systems)
 */
export class RedisAuditStore {
  private readonly PREFIX = 'audit';
  private readonly LIST_KEY = `${this.PREFIX}:logs`;
  private readonly MAX_ENTRIES = 10000;

  constructor(private redis: Redis) {}

  /**
   * Initialize store
   */
  async initialize() {
    logger.info('Redis audit store initialized');
  }

  /**
   * Append audit log entry
   */
  async append(entry: AuditLogEntry): Promise<void> {
    try {
      // Add to list (newest first)
      await this.redis.lpush(this.LIST_KEY, JSON.stringify(entry));

      // Trim to max size
      await this.redis.ltrim(this.LIST_KEY, 0, this.MAX_ENTRIES - 1);

      // Also store in a hash for quick user lookup (optional optimization)
      if (entry.userId) {
        const userKey = `${this.PREFIX}:user:${entry.userId}`;
        await this.redis.lpush(userKey, JSON.stringify(entry));
        await this.redis.ltrim(userKey, 0, 999); // Keep last 1000 per user
        await this.redis.expire(userKey, 60 * 60 * 24 * 30); // 30 days
      }
    } catch (error) {
      logger.error({ error }, 'Failed to write audit log to Redis');
      throw error;
    }
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
    try {
      let logs: AuditLogEntry[] = [];

      // Optimize: query by user if userId filter provided
      if (filters.userId) {
        const userKey = `${this.PREFIX}:user:${filters.userId}`;
        const entries = await this.redis.lrange(userKey, 0, filters.limit || 100);
        logs = entries.map((entry) => JSON.parse(entry));
      } else {
        // Get from main list
        const entries = await this.redis.lrange(this.LIST_KEY, 0, filters.limit || 100);
        logs = entries.map((entry) => JSON.parse(entry));
      }

      // Apply additional filters
      if (filters.eventType) {
        logs = logs.filter((log) => log.eventType === filters.eventType);
      }

      if (filters.startTime) {
        logs = logs.filter((log) => log.timestamp >= filters.startTime!);
      }

      if (filters.endTime) {
        logs = logs.filter((log) => log.timestamp <= filters.endTime!);
      }

      return logs;
    } catch (error) {
      logger.error({ error }, 'Failed to query audit logs from Redis');
      return [];
    }
  }
}

/**
 * Audit store factory
 * Returns file store for dev, Redis for production
 */
export function createAuditStore(redis?: Redis) {
  if (redis) {
    return new RedisAuditStore(redis);
  }
  return new FileAuditStore();
}
