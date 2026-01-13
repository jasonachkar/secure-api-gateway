/**
 * Admin audit log service
 * Records administrative actions in a dedicated store
 */

import { nanoid } from 'nanoid';
import { writeFile, readFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import Redis from 'ioredis';
import { logger } from '../../lib/logger.js';

export interface AdminAuditActor {
  userId: string;
  username: string;
}

export interface AdminAuditLogEntry {
  id: string;
  timestamp: number;
  actor: AdminAuditActor;
  action: string;
  resource: string;
  incidentId?: string;
  metadata?: Record<string, unknown>;
}

interface AdminAuditLogStore {
  initialize(): Promise<void>;
  append(entry: AdminAuditLogEntry): Promise<void>;
  query(filters: AdminAuditLogQuery): Promise<AdminAuditLogEntry[]>;
}

export interface AdminAuditLogQuery {
  actorId?: string;
  action?: string;
  incidentId?: string;
  startTime?: number;
  endTime?: number;
  limit?: number;
  offset?: number;
}

class FileAdminAuditLogStore implements AdminAuditLogStore {
  private logFile: string;

  constructor(logPath: string = './logs/admin-audit-logs.json') {
    this.logFile = logPath;
  }

  async initialize() {
    const dir = path.dirname(this.logFile);
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }

    if (!existsSync(this.logFile)) {
      await writeFile(this.logFile, JSON.stringify([], null, 2));
    }

    logger.info({ logFile: this.logFile }, 'Admin audit log file store initialized');
  }

  async append(entry: AdminAuditLogEntry): Promise<void> {
    try {
      const content = await readFile(this.logFile, 'utf-8');
      const logs: AdminAuditLogEntry[] = JSON.parse(content);

      logs.push(entry);
      const trimmed = logs.slice(-10000);

      await writeFile(this.logFile, JSON.stringify(trimmed, null, 2));
    } catch (error) {
      logger.error({ error }, 'Failed to write admin audit log to file');
      throw error;
    }
  }

  async query(filters: AdminAuditLogQuery): Promise<AdminAuditLogEntry[]> {
    try {
      const content = await readFile(this.logFile, 'utf-8');
      let logs: AdminAuditLogEntry[] = JSON.parse(content);

      if (filters.actorId) {
        logs = logs.filter((log) => log.actor.userId === filters.actorId);
      }

      if (filters.action) {
        logs = logs.filter((log) => log.action === filters.action);
      }

      if (filters.incidentId) {
        logs = logs.filter((log) => log.incidentId === filters.incidentId);
      }

      if (filters.startTime) {
        logs = logs.filter((log) => log.timestamp >= filters.startTime!);
      }

      if (filters.endTime) {
        logs = logs.filter((log) => log.timestamp <= filters.endTime!);
      }

      logs.sort((a, b) => b.timestamp - a.timestamp);

      const offset = filters.offset ?? 0;
      const limit = filters.limit ?? 100;
      return logs.slice(offset, offset + limit);
    } catch (error) {
      logger.error({ error }, 'Failed to query admin audit logs');
      return [];
    }
  }
}

class RedisAdminAuditLogStore implements AdminAuditLogStore {
  private readonly PREFIX = 'admin-audit';
  private readonly LIST_KEY = `${this.PREFIX}:logs`;
  private readonly MAX_ENTRIES = 10000;

  constructor(private redis: Redis) {}

  async initialize() {
    logger.info('Admin audit log Redis store initialized');
  }

  async append(entry: AdminAuditLogEntry): Promise<void> {
    try {
      await this.redis.lpush(this.LIST_KEY, JSON.stringify(entry));
      await this.redis.ltrim(this.LIST_KEY, 0, this.MAX_ENTRIES - 1);
    } catch (error) {
      logger.error({ error }, 'Failed to write admin audit log to Redis');
      throw error;
    }
  }

  async query(filters: AdminAuditLogQuery): Promise<AdminAuditLogEntry[]> {
    try {
      const limit = filters.limit ?? 100;
      const offset = filters.offset ?? 0;
      const end = offset + limit - 1;
      const entries = await this.redis.lrange(this.LIST_KEY, offset, end);
      let logs = entries.map((entry) => JSON.parse(entry) as AdminAuditLogEntry);

      if (filters.actorId) {
        logs = logs.filter((log) => log.actor.userId === filters.actorId);
      }

      if (filters.action) {
        logs = logs.filter((log) => log.action === filters.action);
      }

      if (filters.incidentId) {
        logs = logs.filter((log) => log.incidentId === filters.incidentId);
      }

      if (filters.startTime) {
        logs = logs.filter((log) => log.timestamp >= filters.startTime!);
      }

      if (filters.endTime) {
        logs = logs.filter((log) => log.timestamp <= filters.endTime!);
      }

      return logs;
    } catch (error) {
      logger.error({ error }, 'Failed to query admin audit logs from Redis');
      return [];
    }
  }
}

function createAdminAuditLogStore(redis?: Redis): AdminAuditLogStore {
  if (redis) {
    return new RedisAdminAuditLogStore(redis);
  }
  return new FileAdminAuditLogStore();
}

export class AdminAuditLogService {
  private store: AdminAuditLogStore;

  constructor(redis?: Redis) {
    this.store = createAdminAuditLogStore(redis);
  }

  async initialize() {
    await this.store.initialize();
  }

  async log(entry: Omit<AdminAuditLogEntry, 'id' | 'timestamp'>): Promise<void> {
    const auditEntry: AdminAuditLogEntry = {
      id: nanoid(),
      timestamp: Date.now(),
      ...entry,
    };

    try {
      await this.store.append(auditEntry);
    } catch (error) {
      logger.error({ error }, 'Failed to write admin audit log entry');
    }
  }

  async query(filters: AdminAuditLogQuery): Promise<AdminAuditLogEntry[]> {
    return this.store.query(filters);
  }
}
