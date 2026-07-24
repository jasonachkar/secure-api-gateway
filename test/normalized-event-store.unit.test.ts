/**
 * NormalizedEventStore cursor storage unit tests
 * Uses a real Redis connection, consistent with test/apiKey.unit.test.ts - this repo does
 * not mock ioredis anywhere.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import Redis from 'ioredis';
import { NormalizedEventStore } from '../src/modules/ingestion/normalized-event.store.js';

describe('NormalizedEventStore - cursor storage', () => {
  let redis: Redis;
  let store: NormalizedEventStore;

  beforeEach(() => {
    redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      db: parseInt(process.env.REDIS_DB || '0', 10),
    });
    store = new NormalizedEventStore(redis);
  });

  afterEach(async () => {
    await redis.flushdb();
    await redis.quit();
  });

  it('returns null for a cursor that has never been set', async () => {
    expect(await store.getCursor('cloudwatch')).toBeNull();
  });

  it('round-trips a cursor value', async () => {
    await store.setCursor('cloudwatch', '1700000000000');

    expect(await store.getCursor('cloudwatch')).toBe('1700000000000');
  });

  it('keeps cursors for different adapters independent', async () => {
    await store.setCursor('cloudwatch', '111');
    await store.setCursor('gcp_logging', '222');

    expect(await store.getCursor('cloudwatch')).toBe('111');
    expect(await store.getCursor('gcp_logging')).toBe('222');
  });

  it('overwrites a previous cursor value', async () => {
    await store.setCursor('cloudwatch', '111');
    await store.setCursor('cloudwatch', '222');

    expect(await store.getCursor('cloudwatch')).toBe('222');
  });
});
