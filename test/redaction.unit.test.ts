/**
 * Redaction of secrets/credentials from provider payloads before storage/export.
 */
import { describe, it, expect } from '@jest/globals';
import { redactObject, redactUnknown, redactValue } from '../src/modules/ingestion/redaction.js';

describe('redactValue', () => {
  it('redacts values whose key looks sensitive regardless of value shape', () => {
    expect(redactValue('password', 'hunter2')).toBe('[REDACTED]');
    expect(redactValue('apiKey', 'abc123')).toBe('[REDACTED]');
    expect(redactValue('Authorization', 'Bearer xyz')).toBe('[REDACTED]');
  });

  it('leaves non-sensitive keys untouched', () => {
    expect(redactValue('username', 'alice')).toBe('alice');
    expect(redactValue('region', 'us-east-1')).toBe('us-east-1');
  });

  it('redacts recognizable secret patterns embedded in an otherwise-safe key', () => {
    expect(redactValue('note', 'my key is AKIAABCDEFGHIJKLMNOP')).toBe('my key is [REDACTED]');
    expect(redactValue('note', 'token: Bearer abc.def-ghi')).toContain('[REDACTED]');
  });
});

describe('redactObject', () => {
  it('recursively redacts nested objects and arrays whose parent key is not itself sensitive', () => {
    const input = {
      username: 'alice',
      auth: { password: 'hunter2', apiKey: 'abc123' },
      history: [{ token: 'secret-token-value' }, { note: 'fine' }],
    };
    const output = redactObject(input);
    expect(output.username).toBe('alice');
    expect((output.auth as Record<string, unknown>).password).toBe('[REDACTED]');
    expect((output.auth as Record<string, unknown>).apiKey).toBe('[REDACTED]');
    expect(((output.history as Record<string, unknown>[])[0] as Record<string, unknown>).token).toBe('[REDACTED]');
    expect(((output.history as Record<string, unknown>[])[1] as Record<string, unknown>).note).toBe('fine');
  });

  it('redacts an entire nested value when its own key matches the sensitive pattern (e.g. "credentials")', () => {
    // A key named "credentials" is itself flagged, so the whole blob is nuked
    // rather than selectively descended into - the more conservative behavior.
    const input = { credentials: { password: 'hunter2', notASecretField: 'x' } };
    const output = redactObject(input);
    expect(output.credentials).toBe('[REDACTED]');
  });

  it('does not mutate the original object', () => {
    const input = { password: 'hunter2' };
    redactObject(input);
    expect(input.password).toBe('hunter2');
  });
});

describe('redactUnknown', () => {
  it('handles top-level arrays and primitives', () => {
    expect(redactUnknown([{ secret: 'x' }])).toEqual([{ secret: '[REDACTED]' }]);
    expect(redactUnknown('plain string')).toBe('plain string');
    expect(redactUnknown(42)).toBe(42);
  });
});
