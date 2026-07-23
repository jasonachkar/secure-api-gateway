/**
 * Audit Log Hash Chain Unit Tests
 * Covers hash computation, chain verification, and tamper detection
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import Redis from 'ioredis';
import { AuditService } from '../src/modules/audit/audit.service.js';
import { RedisAuditStore } from '../src/modules/audit/audit.store.js';
import { AuditEventType } from '../src/modules/audit/audit.types.js';
import { GENESIS_HASH, computeEntryHash, verifyEntryChain } from '../src/modules/audit/audit.hash.js';

describe('Audit log hash chain', () => {
  describe('computeEntryHash', () => {
    it('is deterministic for identical input', () => {
      const entry = {
        id: 'e1',
        timestamp: 1000,
        eventType: AuditEventType.LOGIN_SUCCESS,
        ip: '127.0.0.1',
        requestId: 'r1',
        success: true,
        prevHash: GENESIS_HASH,
      };

      expect(computeEntryHash(entry)).toBe(computeEntryHash({ ...entry }));
    });

    it('changes if any field changes', () => {
      const base = {
        id: 'e1',
        timestamp: 1000,
        eventType: AuditEventType.LOGIN_SUCCESS,
        ip: '127.0.0.1',
        requestId: 'r1',
        success: true,
        prevHash: GENESIS_HASH,
      };

      expect(computeEntryHash(base)).not.toBe(computeEntryHash({ ...base, success: false }));
      expect(computeEntryHash(base)).not.toBe(computeEntryHash({ ...base, ip: '10.0.0.1' }));
    });
  });

  describe('verifyEntryChain', () => {
    function buildChain(count: number) {
      const entries: any[] = [];
      let prevHash = GENESIS_HASH;

      for (let i = 0; i < count; i++) {
        const unhashed = {
          id: `e${i}`,
          timestamp: i,
          eventType: AuditEventType.LOGIN_SUCCESS,
          ip: '127.0.0.1',
          requestId: `r${i}`,
          success: true,
          prevHash,
        };
        const hash = computeEntryHash(unhashed);
        entries.push({ ...unhashed, hash });
        prevHash = hash;
      }

      return entries;
    }

    it('validates an untampered chain', () => {
      const result = verifyEntryChain(buildChain(5));
      expect(result.valid).toBe(true);
      expect(result.checked).toBe(5);
    });

    it('detects a modified entry', () => {
      const chain = buildChain(5);
      chain[2].message = 'this was not here before';

      const result = verifyEntryChain(chain);
      expect(result.valid).toBe(false);
      expect(result.brokenEntryId).toBe('e2');
    });

    it('detects a deleted entry (breaks the prevHash link)', () => {
      const chain = buildChain(5);
      chain.splice(2, 1); // remove e2

      const result = verifyEntryChain(chain);
      expect(result.valid).toBe(false);
      expect(result.brokenEntryId).toBe('e3');
    });

    it('an empty chain is trivially valid', () => {
      expect(verifyEntryChain([])).toEqual({ valid: true, checked: 0 });
    });
  });

  describe('AuditService.verifyChain (Redis-backed, end-to-end)', () => {
    let redis: Redis;
    let auditService: AuditService;

    beforeEach(async () => {
      redis = new Redis({
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379', 10),
        db: parseInt(process.env.REDIS_DB || '0', 10),
      });
      auditService = new AuditService(new RedisAuditStore(redis));
      await auditService.initialize();
    });

    afterEach(async () => {
      await redis.flushdb();
      await redis.quit();
    });

    it('reports a valid chain for normally-logged events', async () => {
      await auditService.logLoginSuccess({ userId: 'u1', username: 'alice', ip: '127.0.0.1', requestId: 'r1' });
      await auditService.logLoginFailure({ username: 'bob', ip: '127.0.0.1', requestId: 'r2' });
      await auditService.logRateLimitExceeded({ ip: '127.0.0.1', requestId: 'r3' });

      const result = await auditService.verifyChain();
      expect(result.valid).toBe(true);
      expect(result.checked).toBe(3);
    });

    it('detects direct tampering with a stored entry', async () => {
      await auditService.logLoginSuccess({ userId: 'u1', username: 'alice', ip: '127.0.0.1', requestId: 'r1' });
      await auditService.logLoginFailure({ username: 'bob', ip: '127.0.0.1', requestId: 'r2' });

      // Simulate an attacker with direct Redis access editing a past entry in place
      const raw = await redis.lindex('audit:logs', 0); // most recent entry
      const tampered = JSON.parse(raw!);
      tampered.username = 'not-bob-anymore';
      await redis.lset('audit:logs', 0, JSON.stringify(tampered));

      const result = await auditService.verifyChain();
      expect(result.valid).toBe(false);
      expect(result.reason).toMatch(/modified/i);
    });
  });
});
