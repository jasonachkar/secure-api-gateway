/**
 * Canonical security event storage with atomic deduplication, parser failures, and
 * retention. See docs/CONCURRENCY.md for the atomicity/retry design.
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

/**
 * Atomically claims a dedupe/provider-event slot for `candidateId`. Both keys are
 * checked and (if free) set within a single Lua script, so two concurrent writers can
 * never both observe "not claimed" - Redis executes the whole script as one atomic step.
 * Returns the id that ends up owning the slot: `candidateId` if this call won, or
 * whichever id a concurrent/earlier writer already claimed it with otherwise.
 */
const CLAIM_EVENT_SCRIPT = `
local dedupeKey = KEYS[1]
local providerKey = KEYS[2]
local candidateId = ARGV[1]
local ttl = ARGV[2]

local existing = redis.call('GET', dedupeKey)
if existing then
  return existing
end
existing = redis.call('GET', providerKey)
if existing then
  return existing
end

redis.call('SETEX', dedupeKey, ttl, candidateId)
redis.call('SETEX', providerKey, ttl, candidateId)
return candidateId
`;

export class SecurityEventStore {
  private readonly EVENT_KEY_PREFIX = 'sec:event:';
  private readonly EVENT_INDEX_KEY = 'sec:events:index';
  private readonly PROVIDER_INDEX_KEY_PREFIX = 'sec:events:index:by-provider:';
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
      -- Unique, not just indexed: Redis is the atomic source of truth for dedup (see
      -- CLAIM_EVENT_SCRIPT above), but this constraint means Postgres can never end up
      -- with two rows for the same logical event even if that invariant were ever
      -- violated upstream - a conflict here is treated as "already recorded", not an error.
      CREATE UNIQUE INDEX IF NOT EXISTS idx_security_events_dedupe_unique ON security_events (dedupe_hash);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_security_events_provider_event_unique
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

  /**
   * Persist a normalized event with atomic, race-free deduplication. Two concurrent
   * callers saving the same provider event (same dedupeHash or same
   * provider+providerEventId) always converge on one canonical event id - the loser
   * gets `duplicate: true` and the winner's record back, never a second copy.
   */
  async saveEvent(event: NormalizedSecurityEvent): Promise<SaveEventResult> {
    const validated = validateNormalizedSecurityEvent(event);
    const dedupeKey = `${this.DEDUPE_KEY_PREFIX}${validated.dedupeHash}`;
    const providerKey = `${this.PROVIDER_EVENT_KEY_PREFIX}${validated.provider}:${validated.providerEventId}`;

    const winningId = (await this.redis.eval(
      CLAIM_EVENT_SCRIPT,
      2,
      dedupeKey,
      providerKey,
      validated.id,
      this.RETENTION_SECONDS
    )) as string;

    if (winningId !== validated.id) {
      // Someone else's write claimed this slot first (possibly concurrently with us).
      // Their record is authoritative; a short bounded wait covers the narrow window
      // where they've claimed the slot but haven't finished writing the event body yet.
      const existing = await this.waitForEvent(winningId);
      if (existing) {
        return { event: existing, duplicate: true };
      }
      // The winner's write appears to have failed after claiming (see the cleanup in the
      // catch block below) - fall through and write under our own id instead of losing
      // the event entirely. This reuses the now-abandoned slot.
      await this.redis.setex(dedupeKey, this.RETENTION_SECONDS, validated.id);
      await this.redis.setex(providerKey, this.RETENTION_SECONDS, validated.id);
    }

    try {
      const key = `${this.EVENT_KEY_PREFIX}${validated.id}`;
      const score = new Date(validated.occurredAt).getTime();
      const pipeline = this.redis.pipeline();
      pipeline.setex(key, this.RETENTION_SECONDS, JSON.stringify(validated));
      pipeline.zadd(this.EVENT_INDEX_KEY, score, validated.id);
      pipeline.zadd(`${this.PROVIDER_INDEX_KEY_PREFIX}${validated.provider}`, score, validated.id);
      await pipeline.exec();
    } catch (error) {
      // Clean up the claim so a retried/subsequent write for this same event isn't
      // permanently blocked by a dedupe slot pointing at data that was never written.
      await this.redis.del(dedupeKey, providerKey);
      throw error;
    }

    await this.trimIndex();

    if (this.postgres) {
      try {
        await this.postgres.query(
          `
            INSERT INTO security_events
              (id, provider_event_id, provider, dedupe_hash, occurred_at, ingested_at, schema_version, payload)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            -- Unqualified DO NOTHING (no conflict target) covers a violation of ANY of
            -- the table's unique constraints - primary key, dedupe_hash, or
            -- provider+provider_event_id - which is what we want: Postgres is a durable
            -- mirror of Redis's atomic dedup decision, so any of those three conflicting
            -- means "already recorded", never an error to surface.
            ON CONFLICT DO NOTHING;
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

  /** Bounded wait for a concurrently-claimed event's body to actually appear (see saveEvent). */
  private async waitForEvent(id: string, attempts = 5, delayMs = 15): Promise<NormalizedSecurityEvent | null> {
    for (let attempt = 0; attempt < attempts; attempt++) {
      const event = await this.getEvent(id);
      if (event) return event;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    return null;
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

  /**
   * List events, optionally filtered by provider. A provider filter queries a
   * provider-specific sorted set directly (populated alongside the global index at
   * write time) rather than paging the global index and discarding non-matching
   * entries client-side - a request for 50 AWS events returns up to 50 AWS events even
   * when other providers dominate the global index.
   *
   * Stale index entries (an id whose underlying event key has expired/been removed but
   * is still listed in the sorted set) are pruned lazily as they're encountered here,
   * so the index self-heals across calls instead of growing unboundedly - see
   * docs/CONCURRENCY.md.
   */
  async listEvents(params?: {
    limit?: number;
    offset?: number;
    provider?: CloudProvider;
  }): Promise<NormalizedSecurityEvent[]> {
    const limit = params?.limit ?? 50;
    const offset = params?.offset ?? 0;
    const indexKey = params?.provider
      ? `${this.PROVIDER_INDEX_KEY_PREFIX}${params.provider}`
      : this.EVENT_INDEX_KEY;

    const ids = await this.redis.zrevrange(indexKey, offset, offset + limit - 1);
    if (ids.length === 0) return [];

    const events = await this.getEventsByIds(ids);
    if (events.length < ids.length) {
      const liveIds = new Set(events.map((e) => e.id));
      const staleIds = ids.filter((id) => !liveIds.has(id));
      await this.pruneStaleIndexEntries(staleIds, params?.provider);
    }
    return events;
  }

  private async pruneStaleIndexEntries(staleIds: string[], provider?: CloudProvider): Promise<void> {
    if (staleIds.length === 0) return;
    try {
      const pipeline = this.redis.pipeline();
      for (const id of staleIds) {
        pipeline.zrem(this.EVENT_INDEX_KEY, id);
        if (provider) {
          pipeline.zrem(`${this.PROVIDER_INDEX_KEY_PREFIX}${provider}`, id);
        }
      }
      await pipeline.exec();
    } catch (error) {
      logger.warn({ error, count: staleIds.length }, 'Failed to prune stale security-event index entries');
    }
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
