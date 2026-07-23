/**
 * Redis-backed store for scoped API keys
 *
 * A raw key looks like `gwk_<id>_<secret>`. Only its SHA-256 hash is ever persisted -
 * losing the raw value means it can never be recovered, only revoked and reissued.
 * The id is embedded in the raw key purely so the record can be looked up without a
 * table scan; authentication itself is always decided by the hash match.
 */

import Redis from 'ioredis';
import { createHash, randomBytes } from 'crypto';
import { logger } from '../../lib/logger.js';
import type { ApiKeyRecord } from './apikey.types.js';

const KEY_PREFIX = 'apikey';
const INDEX_KEY = `${KEY_PREFIX}:index`;
const HASH_INDEX_PREFIX = 'apikey:byhash';
const ID_BYTES = 8;
const SECRET_BYTES = 32;

function hashRawKey(rawKey: string): string {
  return createHash('sha256').update(rawKey).digest('hex');
}

export class ApiKeyStore {
  constructor(private redis: Redis) {}

  private async persist(id: string, record: ApiKeyRecord, ttlSeconds?: number): Promise<void> {
    const payload = JSON.stringify(record);
    if (ttlSeconds && ttlSeconds > 0) {
      await this.redis.setex(`${KEY_PREFIX}:${id}`, ttlSeconds, payload);
    } else {
      await this.redis.set(`${KEY_PREFIX}:${id}`, payload);
    }
  }

  /**
   * Create a new API key. Returns the raw key exactly once - the caller must
   * surface it to the admin immediately, since it cannot be retrieved again.
   */
  async create(params: {
    name: string;
    scopes: string[];
    createdBy: string;
    expiresInDays?: number;
  }): Promise<{ record: ApiKeyRecord; rawKey: string }> {
    const id = randomBytes(ID_BYTES).toString('hex');
    const secret = randomBytes(SECRET_BYTES).toString('hex');
    const rawKey = `gwk_${id}_${secret}`;
    const hashedKey = hashRawKey(rawKey);
    const ttlSeconds = params.expiresInDays ? params.expiresInDays * 86400 : undefined;

    const record: ApiKeyRecord = {
      id,
      name: params.name,
      scopes: params.scopes,
      createdAt: Date.now(),
      createdBy: params.createdBy,
      revoked: false,
      ...(ttlSeconds ? { expiresAt: Date.now() + ttlSeconds * 1000 } : {}),
    };

    await this.persist(id, record, ttlSeconds);
    if (ttlSeconds) {
      await this.redis.setex(`${HASH_INDEX_PREFIX}:${hashedKey}`, ttlSeconds, id);
    } else {
      await this.redis.set(`${HASH_INDEX_PREFIX}:${hashedKey}`, id);
    }
    await this.redis.sadd(INDEX_KEY, id);

    logger.info({ id, name: params.name, scopes: params.scopes }, 'API key created');

    return { record, rawKey };
  }

  async findByRawKey(rawKey: string): Promise<ApiKeyRecord | null> {
    const id = await this.redis.get(`${HASH_INDEX_PREFIX}:${hashRawKey(rawKey)}`);
    if (!id) {
      return null;
    }
    return this.get(id);
  }

  async get(id: string): Promise<ApiKeyRecord | null> {
    const data = await this.redis.get(`${KEY_PREFIX}:${id}`);
    return data ? (JSON.parse(data) as ApiKeyRecord) : null;
  }

  async list(): Promise<ApiKeyRecord[]> {
    const ids = await this.redis.smembers(INDEX_KEY);
    if (ids.length === 0) {
      return [];
    }
    const records = await Promise.all(ids.map((id) => this.get(id)));
    return records
      .filter((record): record is ApiKeyRecord => record !== null)
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  async revoke(id: string): Promise<ApiKeyRecord | null> {
    const record = await this.get(id);
    if (!record) {
      return null;
    }

    record.revoked = true;
    record.revokedAt = Date.now();

    const ttl = await this.redis.ttl(`${KEY_PREFIX}:${id}`);
    await this.persist(id, record, ttl > 0 ? ttl : undefined);

    logger.info({ id }, 'API key revoked');
    return record;
  }

  async touchLastUsed(id: string): Promise<void> {
    const record = await this.get(id);
    if (!record) {
      return;
    }
    record.lastUsedAt = Date.now();
    const ttl = await this.redis.ttl(`${KEY_PREFIX}:${id}`);
    await this.persist(id, record, ttl > 0 ? ttl : undefined);
  }

  isUsable(record: ApiKeyRecord): boolean {
    if (record.revoked) {
      return false;
    }
    if (record.expiresAt && record.expiresAt < Date.now()) {
      return false;
    }
    return true;
  }
}
