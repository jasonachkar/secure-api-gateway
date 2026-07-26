/**
 * SecurityEventStore.saveEvent() concurrency: two (or more) workers racing to save the
 * same logical provider event - same dedupeHash and/or same provider+providerEventId -
 * must converge on exactly one canonical event, never create duplicates. Uses a real
 * Redis connection, consistent with the rest of this repo's store tests.
 */
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import Redis from 'ioredis';
import { SecurityEventStore } from '../src/modules/ingestion/security-event.store.js';
import { createNormalizedSecurityEvent } from '../src/modules/ingestion/security-event.schema.js';

function buildInput(overrides: Partial<Parameters<typeof createNormalizedSecurityEvent>[0]> = {}) {
  return {
    providerEventId: 'evt-concurrency-1',
    provider: 'aws' as const,
    sourceService: 'cloudtrail.amazonaws.com',
    occurredAt: '2026-01-01T00:00:00.000Z',
    action: 'ConsoleLogin',
    outcome: 'success' as const,
    severity: 'critical' as const,
    category: 'privilege-escalation' as const,
    title: 'AWS root-account activity',
    summary: 'Root account activity detected',
    provenance: 'live' as const,
    rawEvent: { note: 'concurrency test' },
    ...overrides,
  };
}

describe('SecurityEventStore.saveEvent - concurrency', () => {
  let redis: Redis;
  let store: SecurityEventStore;

  beforeEach(() => {
    redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      db: parseInt(process.env.REDIS_DB || '0', 10),
    });
    store = new SecurityEventStore(redis);
  });

  afterEach(async () => {
    await redis.flushdb();
    await redis.quit();
  });

  it('converges 20 concurrent writers racing on the same dedupeHash to exactly one canonical event', async () => {
    const events = Array.from({ length: 20 }, () => createNormalizedSecurityEvent(buildInput()));
    // Every generated event has a distinct id but the same dedupeHash (same provider,
    // providerEventId, action, occurredAt, sourceIp, accountOrProjectId).
    expect(new Set(events.map((e) => e.dedupeHash)).size).toBe(1);
    expect(new Set(events.map((e) => e.id)).size).toBe(20);

    const results = await Promise.all(events.map((event) => store.saveEvent(event)));

    const winners = results.filter((r) => !r.duplicate);
    const duplicates = results.filter((r) => r.duplicate);
    expect(winners).toHaveLength(1);
    expect(duplicates).toHaveLength(19);

    const winningId = winners[0].event.id;
    for (const result of results) {
      expect(result.event.id).toBe(winningId);
    }

    // Exactly one entry ever made it into the index - no duplicate got past the claim
    // and written its own copy under a different id.
    const allEvents = await store.listEvents({ limit: 100 });
    expect(allEvents.filter((e) => e.providerEventId === 'evt-concurrency-1')).toHaveLength(1);
  });

  it('converges concurrent writers racing on the same provider+providerEventId even with different dedupeHash inputs', async () => {
    // Same providerEventId, but occurredAt differs slightly between "polls" the way a
    // real duplicate delivery might (e.g. re-poll picking up the same CloudTrail record
    // with a slightly different ingestion-observed timestamp) - dedupeHash would differ,
    // but the provider+providerEventId claim must still catch it.
    const events = Array.from({ length: 10 }, (_, i) =>
      createNormalizedSecurityEvent(
        buildInput({ occurredAt: `2026-01-01T00:00:0${i % 10}.000Z` })
      )
    );

    const results = await Promise.all(events.map((event) => store.saveEvent(event)));
    const winners = results.filter((r) => !r.duplicate);
    expect(winners).toHaveLength(1);

    const allEvents = await store.listEvents({ limit: 100 });
    expect(allEvents.filter((e) => e.providerEventId === 'evt-concurrency-1')).toHaveLength(1);
  });

  it('does not lose the event if two truly distinct events race independently (different providerEventId)', async () => {
    const eventA = createNormalizedSecurityEvent(buildInput({ providerEventId: 'evt-a' }));
    const eventB = createNormalizedSecurityEvent(buildInput({ providerEventId: 'evt-b' }));

    const [resultA, resultB] = await Promise.all([store.saveEvent(eventA), store.saveEvent(eventB)]);
    expect(resultA.duplicate).toBe(false);
    expect(resultB.duplicate).toBe(false);
    expect(resultA.event.id).not.toBe(resultB.event.id);

    const allEvents = await store.listEvents({ limit: 100 });
    expect(allEvents).toHaveLength(2);
  });
});
