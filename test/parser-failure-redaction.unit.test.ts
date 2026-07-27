/**
 * Parser-failure evidence must be redacted before persistence with the same treatment
 * successful events get (security-event.schema.ts) - a payload that failed to parse is
 * exactly the payload most likely to be malformed in a way that still carries
 * credentials, so it must never be stored raw. Uses a real Redis connection, consistent
 * with the rest of this repo's store tests (nothing here mocks ioredis).
 */
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import Redis from 'ioredis';
import { SecurityEventStore } from '../src/modules/ingestion/security-event.store.js';

describe('SecurityEventStore.saveParserFailure - redaction', () => {
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

  it('redacts top-level sensitive keys before persisting', async () => {
    const record = await store.saveParserFailure({
      provider: 'aws',
      sourceService: 'test-fixture',
      occurredAt: new Date().toISOString(),
      error: 'AWS event missing provider event ID',
      provenance: 'replay',
      rawEvent: {
        password: 'hunter2',
        authorization: 'Bearer abc.def.ghi',
        cookie: 'session=xyz',
        note: 'not sensitive',
      },
    });

    expect(record.rawEvent.password).toBe('[REDACTED]');
    expect(record.rawEvent.authorization).toBe('[REDACTED]');
    expect(record.rawEvent.cookie).toBe('[REDACTED]');
    expect(record.rawEvent.note).toBe('not sensitive');
  });

  it('redacts AWS access keys, GCP private keys, GitHub and Slack tokens embedded as values', async () => {
    const record = await store.saveParserFailure({
      provider: 'aws',
      sourceService: 'test-fixture',
      occurredAt: new Date().toISOString(),
      error: 'malformed payload',
      provenance: 'replay',
      rawEvent: {
        message: 'access key AKIAABCDEFGHIJKLMNOP was used',
        note: 'github token ghp_abcdefghijklmnopqrstuvwxyz012345',
        slackToken: 'unrelated-key-name-but-slack-shaped-value xoxb-1234567890-abcdefghij',
      },
    });

    expect(record.rawEvent.message).not.toContain('AKIAABCDEFGHIJKLMNOP');
    expect(record.rawEvent.note).not.toContain('ghp_abcdefghijklmnopqrstuvwxyz012345');
    expect(record.rawEvent.slackToken).toBe('[REDACTED]'); // key name itself looks sensitive too
  });

  it('redacts a GCP service-account private key nested inside the payload', async () => {
    const record = await store.saveParserFailure({
      provider: 'gcp',
      sourceService: 'test-fixture',
      occurredAt: new Date().toISOString(),
      error: 'malformed payload',
      provenance: 'replay',
      rawEvent: {
        protoPayload: {
          serviceAccountKey: {
            private_key: '-----BEGIN PRIVATE KEY-----\nMIIC...redacted...\n-----END PRIVATE KEY-----',
            client_email: 'runner@demo-project.iam.gserviceaccount.com',
          },
        },
      },
    });

    const protoPayload = record.rawEvent.protoPayload as Record<string, unknown>;
    const serviceAccountKey = protoPayload.serviceAccountKey as Record<string, unknown>;
    expect(serviceAccountKey.private_key).toBe('[REDACTED]');
    // Non-sensitive nested fields survive - the point is redaction, not destruction.
    expect(serviceAccountKey.client_email).toBe('runner@demo-project.iam.gserviceaccount.com');
  });

  it('redacts sensitive values nested inside arrays, both by key name and by recognizable token shape', async () => {
    const record = await store.saveParserFailure({
      provider: 'azure',
      sourceService: 'test-fixture',
      occurredAt: new Date().toISOString(),
      error: 'malformed payload',
      provenance: 'replay',
      rawEvent: {
        headers: [
          { name: 'Authorization', value: 'Bearer secret-token-value' }, // "value" isn't a sensitive key, but a Bearer token is a recognizable secret shape
          { authorization: 'Bearer another-one' }, // "authorization" is itself a sensitive key
          { name: 'X-Request-Id', value: 'not-a-secret-request-id' },
        ],
      },
    });

    const headers = record.rawEvent.headers as Array<Record<string, unknown>>;
    expect(headers[0].value).toBe('[REDACTED]');
    expect(headers[1].authorization).toBe('[REDACTED]');
    expect(headers[2].value).toBe('not-a-secret-request-id');
  });

  it('redacts regardless of key-name casing (Password, PASSWORD, apiKey, API_KEY)', async () => {
    const record = await store.saveParserFailure({
      provider: 'aws',
      sourceService: 'test-fixture',
      occurredAt: new Date().toISOString(),
      error: 'malformed payload',
      provenance: 'replay',
      rawEvent: {
        Password: 'a',
        PASSWORD: 'b',
        apiKey: 'c',
        API_KEY: 'd',
      },
    });

    expect(record.rawEvent.Password).toBe('[REDACTED]');
    expect(record.rawEvent.PASSWORD).toBe('[REDACTED]');
    expect(record.rawEvent.apiKey).toBe('[REDACTED]');
    expect(record.rawEvent.API_KEY).toBe('[REDACTED]');
  });

  it('persists the redacted (not raw) payload, so a later read never surfaces the original secret', async () => {
    await store.saveParserFailure({
      id: 'failure-fixed-id-1',
      provider: 'aws',
      sourceService: 'test-fixture',
      occurredAt: new Date().toISOString(),
      error: 'malformed payload',
      provenance: 'replay',
      rawEvent: { password: 'hunter2' },
    });

    const raw = await redis.get('sec:parser-failure:failure-fixed-id-1');
    expect(raw).not.toContain('hunter2');
    expect(raw).toContain('[REDACTED]');
  });
});
