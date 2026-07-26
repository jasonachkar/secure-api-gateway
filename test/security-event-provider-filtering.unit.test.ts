/**
 * SecurityEventStore.listEvents() provider filtering must query a provider-specific
 * index directly, not fetch a global page and discard non-matching entries client-side -
 * a request for N AWS events should return up to N AWS events even when other providers
 * dominate the global index. Uses a real Redis connection, consistent with the rest of
 * this repo's store tests.
 */
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import Redis from 'ioredis';
import { SecurityEventStore } from '../src/modules/ingestion/security-event.store.js';
import { createNormalizedSecurityEvent } from '../src/modules/ingestion/security-event.schema.js';

function buildEvent(provider: 'aws' | 'gcp' | 'azure', index: number) {
  return createNormalizedSecurityEvent({
    providerEventId: `${provider}-evt-${index}`,
    provider,
    sourceService: `${provider}-service`,
    // Spread occurrences across time so index ordering (most-recent-first) is meaningful.
    occurredAt: new Date(Date.parse('2026-01-01T00:00:00.000Z') + index * 1000).toISOString(),
    action: 'SomeAction',
    outcome: 'success',
    severity: 'low',
    category: 'other',
    title: `${provider} event ${index}`,
    summary: `${provider} event ${index}`,
    provenance: 'replay',
    rawEvent: {},
  });
}

describe('SecurityEventStore.listEvents - provider filtering', () => {
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

  it('returns up to the requested limit of AWS events even when other providers dominate the global index', async () => {
    // 200 non-AWS events dominate the global index, plus 50 AWS events.
    for (let i = 0; i < 200; i++) {
      await store.saveEvent(buildEvent(i % 2 === 0 ? 'gcp' : 'azure', i));
    }
    for (let i = 0; i < 50; i++) {
      await store.saveEvent(buildEvent('aws', i));
    }

    const awsEvents = await store.listEvents({ provider: 'aws', limit: 50 });
    expect(awsEvents).toHaveLength(50);
    expect(awsEvents.every((e) => e.provider === 'aws')).toBe(true);
  });

  it('paginates within a single provider independently of other providers', async () => {
    for (let i = 0; i < 10; i++) {
      await store.saveEvent(buildEvent('gcp', i));
    }
    for (let i = 0; i < 5; i++) {
      await store.saveEvent(buildEvent('aws', i));
    }

    const page1 = await store.listEvents({ provider: 'aws', limit: 2, offset: 0 });
    const page2 = await store.listEvents({ provider: 'aws', limit: 2, offset: 2 });
    expect(page1).toHaveLength(2);
    expect(page2).toHaveLength(2);
    expect(page1.map((e) => e.id)).not.toEqual(page2.map((e) => e.id));
    expect([...page1, ...page2].every((e) => e.provider === 'aws')).toBe(true);
  });

  it('the unfiltered global listing still returns events from every provider', async () => {
    await store.saveEvent(buildEvent('aws', 1));
    await store.saveEvent(buildEvent('gcp', 2));
    await store.saveEvent(buildEvent('azure', 3));

    const all = await store.listEvents({ limit: 100 });
    expect(new Set(all.map((e) => e.provider))).toEqual(new Set(['aws', 'gcp', 'azure']));
  });
});
