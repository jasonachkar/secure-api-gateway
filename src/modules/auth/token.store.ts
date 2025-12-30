/**
 * Redis-backed token store for refresh token management
 * Implements token rotation and reuse detection
 */

import Redis from 'ioredis';
import { RefreshTokenMetadata } from '../../types/index.js';
import { logger } from '../../lib/logger.js';
import { hashToken } from '../../lib/crypto.js';

/**
 * Token store for managing refresh tokens in Redis
 */
export class TokenStore {
  private readonly PREFIX = 'token';
  private readonly FAMILY_PREFIX = 'token:family';
  private readonly BLACKLIST_PREFIX = 'token:blacklist';

  constructor(private redis: Redis) {}

  /**
   * Store refresh token metadata
   * @param jti - JWT ID
   * @param metadata - Token metadata
   * @param ttlSeconds - Time to live in seconds
   */
  async store(jti: string, metadata: RefreshTokenMetadata, ttlSeconds: number): Promise<void> {
    const key = `${this.PREFIX}:${jti}`;

    try {
      await this.redis.setex(key, ttlSeconds, JSON.stringify(metadata));
      logger.debug({ jti, userId: metadata.userId }, 'Refresh token stored');
    } catch (error) {
      logger.error({ error, jti }, 'Failed to store refresh token');
      throw error;
    }
  }

  /**
   * Retrieve refresh token metadata
   * @param jti - JWT ID
   * @returns Token metadata or null if not found
   */
  async get(jti: string): Promise<RefreshTokenMetadata | null> {
    const key = `${this.PREFIX}:${jti}`;

    try {
      const data = await this.redis.get(key);
      if (!data) {
        return null;
      }

      return JSON.parse(data) as RefreshTokenMetadata;
    } catch (error) {
      logger.error({ error, jti }, 'Failed to retrieve refresh token');
      return null;
    }
  }

  /**
   * Update last used timestamp
   * @param jti - JWT ID
   */
  async updateLastUsed(jti: string): Promise<void> {
    const metadata = await this.get(jti);
    if (!metadata) {
      return;
    }

    metadata.lastUsedAt = Date.now();
    const ttl = await this.redis.ttl(`${this.PREFIX}:${jti}`);
    if (ttl > 0) {
      await this.store(jti, metadata, ttl);
    }
  }

  /**
   * Revoke a refresh token (add to blacklist)
   * @param jti - JWT ID
   * @param ttlSeconds - How long to keep in blacklist
   */
  async revoke(jti: string, ttlSeconds: number): Promise<void> {
    const key = `${this.BLACKLIST_PREFIX}:${jti}`;

    try {
      // Remove from active tokens
      await this.redis.del(`${this.PREFIX}:${jti}`);

      // Add to blacklist
      await this.redis.setex(key, ttlSeconds, '1');

      logger.info({ jti }, 'Refresh token revoked');
    } catch (error) {
      logger.error({ error, jti }, 'Failed to revoke refresh token');
      throw error;
    }
  }

  /**
   * Check if token is revoked
   * @param jti - JWT ID
   * @returns True if revoked
   */
  async isRevoked(jti: string): Promise<boolean> {
    const key = `${this.BLACKLIST_PREFIX}:${jti}`;

    try {
      const exists = await this.redis.exists(key);
      return exists === 1;
    } catch (error) {
      logger.error({ error, jti }, 'Failed to check token revocation');
      // Fail secure: treat as revoked if we can't check
      return true;
    }
  }

  /**
   * Store token family for rotation tracking
   * Helps detect token reuse attacks
   * @param family - Token family ID
   * @param jtis - Array of JTI IDs in this family
   * @param ttlSeconds - Time to live
   */
  async storeFamily(family: string, jtis: string[], ttlSeconds: number): Promise<void> {
    const key = `${this.FAMILY_PREFIX}:${family}`;

    try {
      await this.redis.setex(key, ttlSeconds, JSON.stringify(jtis));
    } catch (error) {
      logger.error({ error, family }, 'Failed to store token family');
    }
  }

  /**
   * Get token family
   * @param family - Token family ID
   * @returns Array of JTI IDs or null
   */
  async getFamily(family: string): Promise<string[] | null> {
    const key = `${this.FAMILY_PREFIX}:${family}`;

    try {
      const data = await this.redis.get(key);
      if (!data) {
        return null;
      }

      return JSON.parse(data) as string[];
    } catch (error) {
      logger.error({ error, family }, 'Failed to get token family');
      return null;
    }
  }

  /**
   * Revoke entire token family (on reuse detection)
   * @param family - Token family ID
   * @param ttlSeconds - Blacklist TTL
   */
  async revokeFamily(family: string, ttlSeconds: number): Promise<void> {
    try {
      const jtis = await this.getFamily(family);
      if (!jtis) {
        return;
      }

      // Revoke all tokens in family
      await Promise.all(jtis.map((jti) => this.revoke(jti, ttlSeconds)));

      // Remove family
      await this.redis.del(`${this.FAMILY_PREFIX}:${family}`);

      logger.warn({ family, count: jtis.length }, 'Token family revoked (reuse detected)');
    } catch (error) {
      logger.error({ error, family }, 'Failed to revoke token family');
      throw error;
    }
  }

  /**
   * Verify token hash matches stored value
   * Prevents token substitution attacks
   * @param jti - JWT ID
   * @param tokenHash - SHA-256 hash of token
   * @returns True if hash matches
   */
  async verifyTokenHash(jti: string, tokenHash: string): Promise<boolean> {
    const metadata = await this.get(jti);
    if (!metadata) {
      return false;
    }

    return metadata.tokenHash === tokenHash;
  }

  /**
   * Clean up expired tokens (maintenance task)
   * Redis handles TTL automatically, but this can be used for manual cleanup
   */
  async cleanup(): Promise<void> {
    logger.info('Token cleanup not needed (Redis handles TTL automatically)');
  }
}
