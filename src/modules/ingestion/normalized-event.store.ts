/**
 * Normalized event storage backed by Redis and optional Postgres.
 */

import Redis from 'ioredis';
import { logger } from '../../lib/logger.js';
import type { NormalizedEvent, IngestionStorageStatus } from './normalized-event.types.js';

export interface PostgresClient {
  query: (text: string, params?: unknown[]) => Promise<unknown>;
  end?: () => Promise<void>;
}

export class NormalizedEventStore {
  private readonly EVENT_KEY_PREFIX = 'ingestion:event:';
  private readonly EVENT_INDEX_KEY = 'ingestion:events:index';

  constructor(private readonly redis: Redis, private readonly postgres?: PostgresClient) {}

  async initialize(): Promise<void> {
    if (!this.postgres) return;

    await this.postgres.query(`
      CREATE TABLE IF NOT EXISTS normalized_events (
        event_id TEXT PRIMARY KEY,
        event_type TEXT NOT NULL,
        source TEXT NOT NULL,
        timestamp BIGINT NOT NULL,
        severity TEXT NOT NULL,
        payload JSONB NOT NULL
      );
    `);
  }

  async saveEvent(event: NormalizedEvent): Promise<void> {
    const key = `${this.EVENT_KEY_PREFIX}${event.id}`;
    const pipeline = this.redis.pipeline();
    pipeline.set(key, JSON.stringify(event));
    pipeline.zadd(this.EVENT_INDEX_KEY, event.timestamp, event.id);
    await pipeline.exec();

    if (this.postgres) {
      await this.postgres.query(
        `
          INSERT INTO normalized_events (event_id, event_type, source, timestamp, severity, payload)
          VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT (event_id) DO NOTHING;
        `,
        [
          event.id,
          event.event_type,
          event.source,
          event.timestamp,
          event.severity,
          event.payload,
        ]
      );
    }
  }

  async getStatus(): Promise<IngestionStorageStatus> {
    let redisConnected = false;
    let postgresConnected = false;

    try {
      const pong = await this.redis.ping();
      redisConnected = pong === 'PONG';
    } catch (error) {
      logger.warn({ error }, 'Redis unavailable for ingestion status');
    }

    if (this.postgres) {
      try {
        await this.postgres.query('SELECT 1');
        postgresConnected = true;
      } catch (error) {
        logger.warn({ error }, 'Postgres unavailable for ingestion status');
      }
    }

    let totalEvents = 0;
    let lastEventAt: number | undefined;

    try {
      totalEvents = await this.redis.zcard(this.EVENT_INDEX_KEY);
      const lastEventResult = await this.redis.zrevrange(this.EVENT_INDEX_KEY, 0, 0, 'WITHSCORES');
      lastEventAt = lastEventResult.length > 1 ? Number(lastEventResult[1]) : undefined;
    } catch (error) {
      logger.warn({ error }, 'Failed to read ingestion event index from Redis');
    }

    return {
      redisConnected,
      postgresConnected,
      totalEvents,
      lastEventAt,
    };
  }
}
