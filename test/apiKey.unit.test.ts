/**
 * API Key Unit Tests
 * Covers the API key store (create/find/revoke/expiry) and the auth middleware
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import Redis from 'ioredis';
import { ApiKeyStore } from '../src/modules/apikeys/apikey.store.js';
import { createOptionalApiKeyAuth, requireApiKeyScope } from '../src/modules/apikeys/apikey.middleware.js';
import { UnauthorizedError, ForbiddenError } from '../src/lib/errors.js';

function makeRequest(headers: Record<string, string> = {}): any {
  return {
    headers,
    url: '/upstream/echo',
    server: {},
  };
}

describe('API Keys', () => {
  let redis: Redis;
  let store: ApiKeyStore;

  beforeEach(() => {
    redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      db: parseInt(process.env.REDIS_DB || '0', 10),
    });
    store = new ApiKeyStore(redis);
  });

  afterEach(async () => {
    await redis.flushdb();
    await redis.quit();
  });

  describe('ApiKeyStore', () => {
    it('creates a key and finds it back by its raw value', async () => {
      const { record, rawKey } = await store.create({
        name: 'CI pipeline',
        scopes: ['proxy:access'],
        createdBy: 'user-1',
      });

      expect(rawKey).toMatch(/^gwk_/);
      expect(record.revoked).toBe(false);

      const found = await store.findByRawKey(rawKey);
      expect(found?.id).toBe(record.id);
    });

    it('never matches a similar-but-wrong raw key', async () => {
      const { rawKey } = await store.create({ name: 'k', scopes: ['proxy:access'], createdBy: 'user-1' });

      const found = await store.findByRawKey(rawKey + 'x');
      expect(found).toBeNull();
    });

    it('revoke marks the key unusable but still findable', async () => {
      const { record, rawKey } = await store.create({ name: 'k', scopes: ['proxy:access'], createdBy: 'user-1' });

      await store.revoke(record.id);
      const found = await store.findByRawKey(rawKey);

      expect(found?.revoked).toBe(true);
      expect(store.isUsable(found!)).toBe(false);
    });

    it('list returns all created keys, newest first', async () => {
      const a = await store.create({ name: 'first', scopes: ['proxy:access'], createdBy: 'user-1' });
      const b = await store.create({ name: 'second', scopes: ['proxy:access'], createdBy: 'user-1' });

      const list = await store.list();
      expect(list.map((r) => r.id)).toEqual([b.record.id, a.record.id]);
    });

    it('treats an expired key as unusable', async () => {
      const { record } = await store.create({
        name: 'short-lived',
        scopes: ['proxy:access'],
        createdBy: 'user-1',
        expiresInDays: 1,
      });

      // Simulate the future by asserting on a record with expiresAt already in the past
      const expiredRecord = { ...record, expiresAt: Date.now() - 1000 };
      expect(store.isUsable(expiredRecord)).toBe(false);
    });
  });

  describe('createOptionalApiKeyAuth', () => {
    it('continues silently when no X-API-Key header is present', async () => {
      const middleware = createOptionalApiKeyAuth(store);
      const request = makeRequest();

      await expect(middleware(request, {} as any)).resolves.toBeUndefined();
      expect(request.apiKey).toBeUndefined();
    });

    it('attaches apiKey context for a valid key', async () => {
      const { rawKey, record } = await store.create({
        name: 'k',
        scopes: ['proxy:access'],
        createdBy: 'user-1',
      });

      const middleware = createOptionalApiKeyAuth(store);
      const request = makeRequest({ 'x-api-key': rawKey });

      await middleware(request, {} as any);

      expect(request.apiKey).toEqual({ id: record.id, name: 'k', scopes: ['proxy:access'] });
    });

    it('rejects a revoked key rather than silently ignoring it', async () => {
      const { rawKey, record } = await store.create({ name: 'k', scopes: ['proxy:access'], createdBy: 'user-1' });
      await store.revoke(record.id);

      const middleware = createOptionalApiKeyAuth(store);
      const request = makeRequest({ 'x-api-key': rawKey });

      await expect(middleware(request, {} as any)).rejects.toThrow(UnauthorizedError);
    });
  });

  describe('requireApiKeyScope', () => {
    it('passes when the key has the required scope', async () => {
      const request = makeRequest();
      request.apiKey = { id: 'k1', name: 'k', scopes: ['proxy:access', 'read:reports'] };

      await expect(requireApiKeyScope('proxy:access')(request)).resolves.toBeUndefined();
    });

    it('throws ForbiddenError when the scope is missing', async () => {
      const request = makeRequest();
      request.apiKey = { id: 'k1', name: 'k', scopes: ['read:reports'] };

      await expect(requireApiKeyScope('proxy:access')(request)).rejects.toThrow(ForbiddenError);
    });

    it('throws UnauthorizedError when no API key context is present at all', async () => {
      const request = makeRequest();

      await expect(requireApiKeyScope('proxy:access')(request)).rejects.toThrow(UnauthorizedError);
    });
  });
});
