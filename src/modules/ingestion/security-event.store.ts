/**
 * Canonical security event storage with deduplication, parser failures, and retention.
 */

import Redis from 'ioredis';
import { nanoid } from 'nanoid';
import { logger } from '../../lib/logger.js';
import type { NormalizedSecurityEvent, ParserFailure, CloudProvider } from '../security/types.js';
import { validateNormalizedSecurityEvent } from './security-event.schema.js';
import type { PostgresClient } from './normalized-event.store.js';
import { migrateLegacyNormalizedEvent } from './security-event.schema.js';
import type { NormalizedEvent } from './normalized-event.types.js';
import { redactObject } from './redaction.js';

export interface SaveEventResult {
  event: NormalizedSecurityEvent;
  duplicate: boolean;
}

export class SecurityEventStore {
  private readonly EVENT_KEY_PREFIX = 'sec:event:';
  private readonly EVENT_INDEX_KEY = 'sec:events:index';
  private readonly DEDUPE_KEY_PREFIX = 'sec:dedupe:';
  private readonly PROVIDER_EVENT_KEY_PREFIX = 'sec:provider-event:';
  private readonly FAILURE_KEY_PREFIX = 'sec:parser-failure:';
  private readonly FAILURE_INDEX_KEY = 'sec:parser-failures:index';
  private readonly RETENTION_SECONDS = 30 * 24 * 60 * 60; // 30 days
  private readonly MAX_EVENTS = 50_000;

  constructor(
    private readonly redis: Redis,
    private readonly postgres?: PostgresClient
  ) {}

  async initialize(): Promise<void> {
    if (!this.postgres) return;

    await this.postgres.query(`
      CREATE TABLE IF NOT EXISTS security_events (
        id TEXT PRIMARY KEY,
        provider_event_id TEXT NOT NULL,
        provider TEXT NOT NULL,
        dedupe_hash TEXT NOT NULL,
        occurred_at TIMESTAMPTZ NOT NULL,
        ingested_at TIMESTAMPTZ NOT NULL,
        schema_version TEXT NOT NULL,
        payload JSONB NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_security_events_dedupe ON security_events (dedupe_hash);
      CREATE INDEX IF NOT EXISTS idx_security_events_provider_event
        ON security_events (provider, provider_event_id);
    `);

    await this.postgres.query(`
      CREATE TABLE IF NOT EXISTS parser_failures (
        id TEXT PRIMARY KEY,
        provider TEXT NOT NULL,
        ingested_at TIMESTAMPTZ NOT NULL,
        payload JSONB NOT NULL
      );
    `);
  }

  async saveEvent(event: NormalizedSecurityEvent): Promise<SaveEventResult> {
    const validated = validateNormalizedSecurityEvent(event);
    const dedupeKey = `${this.DEDUPE_KEY_PREFIX}${validated.dedupeHash}`;
    const providerKey = `${this.PROVIDER_EVENT_KEY_PREFIX}${validated.provider}:${validated.providerEventId}`;

    const existingId =
      (await this.redis.get(dedupeKey)) || (await this.redis.get(providerKey));

    if (existingId) {
      const existing = await this.getEvent(existingId);
      if (existing) {
        return { event: existing, duplicate: true };
      }
    }

    const key = `${this.EVENT_KEY_PREFIX}${validated.id}`;
    const score = new Date(validated.occurredAt).getTime();
    const pipeline = this.redis.pipeline();
    pipeline.setex(key, this.RETENTION_SECONDS, JSON.stringify(validated));
    pipeline.zadd(this.EVENT_INDEX_KEY, score, validated.id);
    pipeline.setex(dedupeKey, this.RETENTION_SECONDS, validated.id);
    pipeline.setex(providerKey, this.RETENTION_SECONDS, validated.id);
    await pipeline.exec();

    await this.trimIndex();

    if (this.postgres) {
      try {
        await this.postgres.query(
          `
            INSERT INTO security_events
              (id, provider_event_id, provider, dedupe_hash, occurred_at, ingested_at, schema_version, payload)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            ON CONFLICT (id) DO NOTHING;
          `,
          [
            validated.id,
            validated.providerEventId,
            validated.provider,
            validated.dedupeHash,
            validated.occurredAt,
            validated.ingestedAt,
            validated.schemaVersion,
            validated,
          ]
        );
      } catch (error) {
        logger.warn({ error, eventId: validated.id }, 'Failed to persist security event to Postgres');
      }
    }

    return { event: validated, duplicate: false };
  }

  async getEvent(id: string): Promise<NormalizedSecurityEvent | null> {
    const raw = await this.redis.get(`${this.EVENT_KEY_PREFIX}${id}`);
    if (!raw) return null;
    try {
      return validateNormalizedSecurityEvent(JSON.parse(raw));
    } catch {
      return null;
    }
  }

  async getEventsByIds(ids: string[]): Promise<NormalizedSecurityEvent[]> {
    if (ids.length === 0) return [];
    const pipeline = this.redis.pipeline();
    for (const id of ids) {
      pipeline.get(`${this.EVENT_KEY_PREFIX}${id}`);
    }
    const results = await pipeline.exec();
    const events: NormalizedSecurityEvent[] = [];
    if (!results) return events;
    for (const [err, data] of results) {
      if (err || !data) continue;
      try {
        events.push(validateNormalizedSecurityEvent(JSON.parse(data as string)));
      } catch {
        // skip invalid
      }
    }
    return events;
  }

  async listEvents(params?: {
    limit?: number;
    offset?: number;
    provider?: CloudProvider;
  }): Promise<NormalizedSecurityEvent[]> {
    const limit = params?.limit ?? 50;
    const offset = params?.offset ?? 0;
    const ids = await this.redis.zrevrange(
      this.EVENT_INDEX_KEY,
      offset,
      offset + limit - 1
    );
    const events = await this.getEventsByIds(ids);
    if (params?.provider) {
      return events.filter((e) => e.provider === params.provider);
    }
    return events;
  }

  async saveParserFailure(
    failure: Omit<ParserFailure, 'id' | 'ingestedAt'> & { id?: string; ingestedAt?: string }
  ): Promise<ParserFailure> {
    const record: ParserFailure = {
      id: failure.id ?? nanoid(),
      provider: failure.provider,
      sourceService: failure.sourceService,
      occurredAt: failure.occurredAt,
      ingestedAt: failure.ingestedAt ?? new Date().toISOString(),
      error: failure.error,
      provenance: failure.provenance,
      // A payload that failed to parse is exactly the payload most likely to be
      // malformed/unexpected in a way that still carries credentials (a raw provider
      // record that doesn't match any known shape). Redact it with the same treatment
      // successful events get in security-event.schema.ts, not a weaker one - a parser
      // failure must never become a way to store secrets unredacted.
      rawEvent: redactObject(failure.rawEvent),
    };

    const key = `${this.FAILURE_KEY_PREFIX}${record.id}`;
    const score = new Date(record.ingestedAt).getTime();
    await this.redis.setex(key, this.RETENTION_SECONDS, JSON.stringify(record));
    await this.redis.zadd(this.FAILURE_INDEX_KEY, score, record.id);

    if (this.postgres) {
      try {
        await this.postgres.query(
          `
            INSERT INTO parser_failures (id, provider, ingested_at, payload)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (id) DO NOTHING;
          `,
          [record.id, record.provider, record.ingestedAt, record]
        );
      } catch (error) {
        logger.warn({ error }, 'Failed to persist parser failure to Postgres');
      }
    }

    return record;
  }

  async countParserFailures(): Promise<number> {
    return this.redis.zcard(this.FAILURE_INDEX_KEY);
  }

  /** Storage connectivity + volume, for the ingestion status surface (GET /admin/ingestion/status). */
  async getStorageStatus(): Promise<{
    redisConnected: boolean;
    postgresConnected: boolean;
    totalEvents: number;
    lastEventAt?: number;
  }> {
    let redisConnected = false;
    try {
      redisConnected = (await this.redis.ping()) === 'PONG';
    } catch (error) {
      logger.warn({ error }, 'Redis unavailable for ingestion status');
    }

    let postgresConnected = false;
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
      logger.warn({ error }, 'Failed to read security-event index from Redis');
    }

    return { redisConnected, postgresConnected, totalEvents, lastEventAt };
  }

  async migrateLegacyEvent(legacy: NormalizedEvent): Promise<SaveEventResult> {
    const migrated = migrateLegacyNormalizedEvent(legacy);
    return this.saveEvent(migrated);
  }

  private async trimIndex(): Promise<void> {
    const count = await this.redis.zcard(this.EVENT_INDEX_KEY);
    if (count <= this.MAX_EVENTS) return;
    const removeCount = count - this.MAX_EVENTS;
    const staleIds = await this.redis.zrange(this.EVENT_INDEX_KEY, 0, removeCount - 1);
    if (staleIds.length === 0) return;
    const pipeline = this.redis.pipeline();
    for (const id of staleIds) {
      pipeline.del(`${this.EVENT_KEY_PREFIX}${id}`);
      pipeline.zrem(this.EVENT_INDEX_KEY, id);
    }
    await pipeline.exec();
  }
}
