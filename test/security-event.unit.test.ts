/**
 * Canonical NormalizedSecurityEvent schema: creation, validation, deterministic
 * deduplication hashing, and legacy-event migration.
 */
import { describe, it, expect } from '@jest/globals';
import {
  computeDedupeHash,
  createNormalizedSecurityEvent,
  migrateLegacyNormalizedEvent,
  validateNormalizedSecurityEvent,
} from '../src/modules/ingestion/security-event.schema.js';
import { SECURITY_EVENT_SCHEMA_VERSION } from '../src/modules/security/types.js';

function baseInput(overrides: Partial<Parameters<typeof createNormalizedSecurityEvent>[0]> = {}) {
  return {
    providerEventId: 'evt-1',
    provider: 'aws' as const,
    sourceService: 'cloudtrail.amazonaws.com',
    occurredAt: '2026-01-01T00:00:00.000Z',
    action: 'ConsoleLogin',
    outcome: 'success' as const,
    severity: 'critical' as const,
    category: 'privilege-escalation' as const,
    title: 'AWS root-account activity',
    summary: 'Root account activity detected',
    provenance: 'replay' as const,
    rawEvent: { secretAccessKey: 'AKIAABCDEFGHIJKLMNOP', note: 'hello' },
    ...overrides,
  };
}

describe('createNormalizedSecurityEvent', () => {
  it('produces a schema-valid event with the current schema version', () => {
    const event = createNormalizedSecurityEvent(baseInput());
    expect(event.schemaVersion).toBe(SECURITY_EVENT_SCHEMA_VERSION);
    expect(() => validateNormalizedSecurityEvent(event)).not.toThrow();
  });

  it('computes ingestionDelayMs from occurredAt -> ingestedAt', () => {
    const event = createNormalizedSecurityEvent(
      baseInput({ occurredAt: '2026-01-01T00:00:00.000Z', ingestedAt: '2026-01-01T00:00:05.000Z' })
    );
    expect(event.ingestionDelayMs).toBe(5000);
  });

  it('redacts sensitive keys in the stored raw event', () => {
    const event = createNormalizedSecurityEvent(baseInput());
    expect(event.rawEvent.secretAccessKey).toBe('[REDACTED]');
    expect(event.rawEvent.note).toBe('hello');
  });

  it('rejects an invalid timestamp', () => {
    expect(() => createNormalizedSecurityEvent(baseInput({ occurredAt: 'not-a-date' }))).toThrow();
  });
});

describe('computeDedupeHash', () => {
  it('is deterministic for identical inputs', () => {
    const input = {
      provider: 'aws' as const,
      providerEventId: 'evt-1',
      action: 'ConsoleLogin',
      occurredAt: '2026-01-01T00:00:00.000Z',
      sourceIp: '192.0.2.10',
      accountOrProjectId: '123456789012',
    };
    expect(computeDedupeHash(input)).toBe(computeDedupeHash({ ...input }));
  });

  it('differs when the provider event id differs', () => {
    const base = {
      provider: 'aws' as const,
      action: 'ConsoleLogin',
      occurredAt: '2026-01-01T00:00:00.000Z',
    };
    expect(computeDedupeHash({ ...base, providerEventId: 'evt-1' })).not.toBe(
      computeDedupeHash({ ...base, providerEventId: 'evt-2' })
    );
  });

  it('two events built with the same input produce the same dedupe hash', () => {
    const a = createNormalizedSecurityEvent(baseInput());
    const b = createNormalizedSecurityEvent(baseInput());
    expect(a.dedupeHash).toBe(b.dedupeHash);
  });
});

describe('migrateLegacyNormalizedEvent', () => {
  it('maps a legacy NormalizedEvent into the canonical schema with synthetic provenance', () => {
    const migrated = migrateLegacyNormalizedEvent({
      id: 'legacy-1',
      event_type: 'cloudwatch_log',
      source: 'aws-cloudwatch',
      timestamp: Date.now(),
      severity: 'high',
      payload: { message: 'hello' },
    });
    expect(migrated.provider).toBe('aws');
    expect(migrated.provenance).toBe('synthetic');
    expect(() => validateNormalizedSecurityEvent(migrated)).not.toThrow();
  });
});
