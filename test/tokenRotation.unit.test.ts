/**
 * Token Rotation Unit Tests
 * Tests refresh token rotation and reuse detection logic
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { TokenStore } from '../src/modules/auth/token.store.js';
import { RefreshTokenMetadata } from '../src/types/index.js';
import { hashToken, generateJti } from '../src/lib/crypto.js';
import Redis from 'ioredis';

describe('Token Rotation', () => {
  let redis: Redis;
  let tokenStore: TokenStore;

  beforeEach(() => {
    // Create Redis client for testing
    redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      db: 1, // Use separate DB for tests
    });

    tokenStore = new TokenStore(redis);
  });

  afterEach(async () => {
    // Clean up
    await redis.flushdb();
    await redis.quit();
  });

  describe('Token Storage', () => {
    it('should store and retrieve token metadata', async () => {
      // Arrange
      const jti = generateJti();
      const token = 'test-token-12345';
      const metadata: RefreshTokenMetadata = {
        userId: 'user-1',
        username: 'testuser',
        roles: ['user'],
        permissions: ['read:reports'],
        jti,
        tokenHash: hashToken(token),
        createdAt: Date.now(),
        expiresAt: Date.now() + 60000,
      };

      // Act
      await tokenStore.store(jti, metadata, 60); // 60 seconds TTL

      // Assert
      const retrieved = await tokenStore.get(jti);
      expect(retrieved).not.toBeNull();
      expect(retrieved?.userId).toBe(metadata.userId);
      expect(retrieved?.jti).toBe(jti);
      expect(retrieved?.tokenHash).toBe(metadata.tokenHash);
    });

    it('should return null for non-existent token', async () => {
      // Arrange
      const nonExistentJti = generateJti();

      // Act
      const retrieved = await tokenStore.get(nonExistentJti);

      // Assert
      expect(retrieved).toBeNull();
    });
  });

  describe('Token Revocation', () => {
    it('should revoke token successfully', async () => {
      // Arrange
      const jti = generateJti();
      const metadata: RefreshTokenMetadata = {
        userId: 'user-1',
        username: 'testuser',
        roles: ['user'],
        permissions: ['read:reports'],
        jti,
        tokenHash: hashToken('test-token'),
        createdAt: Date.now(),
        expiresAt: Date.now() + 60000,
      };

      await tokenStore.store(jti, metadata, 60);

      // Act
      await tokenStore.revoke(jti, 60);

      // Assert
      const isRevoked = await tokenStore.isRevoked(jti);
      expect(isRevoked).toBe(true);

      const retrieved = await tokenStore.get(jti);
      expect(retrieved).toBeNull();
    });

    it('should detect token reuse after revocation', async () => {
      // Arrange
      const jti = generateJti();
      await tokenStore.revoke(jti, 60);

      // Act
      const isRevoked = await tokenStore.isRevoked(jti);

      // Assert
      expect(isRevoked).toBe(true);
    });
  });

  describe('Token Hash Verification', () => {
    it('should verify correct token hash', async () => {
      // Arrange
      const jti = generateJti();
      const token = 'test-token-12345';
      const tokenHash = hashToken(token);

      const metadata: RefreshTokenMetadata = {
        userId: 'user-1',
        username: 'testuser',
        roles: ['user'],
        permissions: ['read:reports'],
        jti,
        tokenHash,
        createdAt: Date.now(),
        expiresAt: Date.now() + 60000,
      };

      await tokenStore.store(jti, metadata, 60);

      // Act
      const isValid = await tokenStore.verifyTokenHash(jti, tokenHash);

      // Assert
      expect(isValid).toBe(true);
    });

    it('should reject incorrect token hash (reuse detection)', async () => {
      // Arrange
      const jti = generateJti();
      const originalToken = 'original-token';
      const stolenToken = 'stolen-token';

      const metadata: RefreshTokenMetadata = {
        userId: 'user-1',
        username: 'testuser',
        roles: ['user'],
        permissions: ['read:reports'],
        jti,
        tokenHash: hashToken(originalToken),
        createdAt: Date.now(),
        expiresAt: Date.now() + 60000,
      };

      await tokenStore.store(jti, metadata, 60);

      // Act
      const isValid = await tokenStore.verifyTokenHash(jti, hashToken(stolenToken));

      // Assert
      expect(isValid).toBe(false);
    });
  });

  describe('Token Family Management', () => {
    it('should store and retrieve token family', async () => {
      // Arrange
      const family = 'family-' + generateJti();
      const jtis = [generateJti(), generateJti(), generateJti()];

      // Act
      await tokenStore.storeFamily(family, jtis, 60);

      // Assert
      const retrieved = await tokenStore.getFamily(family);
      expect(retrieved).toEqual(jtis);
    });

    it('should revoke entire token family on reuse detection', async () => {
      // Arrange
      const family = 'family-' + generateJti();
      const jti1 = generateJti();
      const jti2 = generateJti();
      const jtis = [jti1, jti2];

      // Store tokens
      await Promise.all(
        jtis.map((jti) =>
          tokenStore.store(
            jti,
            {
              userId: 'user-1',
              username: 'testuser',
              roles: ['user'],
              permissions: [],
              jti,
              tokenHash: hashToken('token'),
              family,
              createdAt: Date.now(),
              expiresAt: Date.now() + 60000,
            },
            60
          )
        )
      );

      await tokenStore.storeFamily(family, jtis, 60);

      // Act: Revoke family
      await tokenStore.revokeFamily(family, 60);

      // Assert: All tokens should be revoked
      const isRevoked1 = await tokenStore.isRevoked(jti1);
      const isRevoked2 = await tokenStore.isRevoked(jti2);

      expect(isRevoked1).toBe(true);
      expect(isRevoked2).toBe(true);
    });
  });
});
