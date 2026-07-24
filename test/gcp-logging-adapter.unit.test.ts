/**
 * GCP Cloud Logging ingestion adapter unit tests
 * Mocks the @google-cloud/logging client - follows the jest.mock + jest.resetModules +
 * require convention used in test/httpClient.unit.test.ts.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const mockGetEntries = jest.fn();

jest.mock('@google-cloud/logging', () => ({
  __esModule: true,
  Logging: jest.fn().mockImplementation(() => ({ getEntries: mockGetEntries })),
}));

const VALID_KEY = JSON.stringify({ client_email: 'test@example.iam.gserviceaccount.com', private_key: 'fake' });

describe('GcpLoggingAdapter', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let GcpLoggingAdapter: any;
  let store: { getCursor: jest.Mock; setCursor: jest.Mock };
  let onEvent: jest.Mock;

  beforeEach(() => {
    jest.resetModules();
    mockGetEntries.mockReset();

    store = {
      getCursor: jest.fn().mockResolvedValue(null),
      setCursor: jest.fn().mockResolvedValue(undefined),
    };
    onEvent = jest.fn().mockResolvedValue(undefined);

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    ({ GcpLoggingAdapter } = require('../src/modules/ingestion/adapters/gcp-logging.adapter.js'));
  });

  it('reports not configured when the project id or key is missing', async () => {
    const adapter = new GcpLoggingAdapter(undefined, VALID_KEY, store, onEvent, 60000);

    const status = await adapter.getStatus();

    expect(status.configured).toBe(false);
    expect(status.healthy).toBe(false);
    expect(mockGetEntries).not.toHaveBeenCalled();
  });

  it('degrades to not-configured (rather than throwing) when the service account key is malformed JSON', async () => {
    const adapter = new GcpLoggingAdapter('my-project', 'not-json', store, onEvent, 60000);

    const status = await adapter.getStatus();

    expect(status.configured).toBe(false);
    expect(status.detail).toMatch(/missing/i);
  });

  it('polls, normalizes entries, maps GCP severity, and advances the cursor', async () => {
    store.getCursor.mockResolvedValue('500');
    const timestamp = new Date('2026-01-01T00:00:10.000Z');
    mockGetEntries.mockResolvedValueOnce([
      [
        {
          metadata: { timestamp, severity: 'ERROR', logName: 'projects/my-project/logs/audit' },
          data: { message: 'something happened' },
        },
      ],
    ]);

    const adapter = new GcpLoggingAdapter('my-project', VALID_KEY, store, onEvent, 60000);
    await adapter.poll();

    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event_type: 'gcp_log',
        source: 'projects/my-project/logs/audit',
        severity: 'high',
        timestamp: timestamp.getTime(),
      })
    );
    expect(store.setCursor).toHaveBeenCalledWith('gcp_logging', String(timestamp.getTime() + 1));

    const status = await adapter.getStatus();
    expect(status.healthy).toBe(true);
    expect(status.lastSyncAt).toBeDefined();
  });

  it('does not advance the cursor when a poll returns no entries', async () => {
    mockGetEntries.mockResolvedValueOnce([[]]);

    const adapter = new GcpLoggingAdapter('my-project', VALID_KEY, store, onEvent, 60000);
    await adapter.poll();

    expect(onEvent).not.toHaveBeenCalled();
    expect(store.setCursor).not.toHaveBeenCalled();
  });

  it('marks unhealthy after repeated poll failures, and recovers after a success', async () => {
    mockGetEntries.mockRejectedValue(new Error('permission denied'));

    const adapter = new GcpLoggingAdapter('my-project', VALID_KEY, store, onEvent, 60000);
    await adapter.poll();
    await adapter.poll();
    await adapter.poll();

    let status = await adapter.getStatus();
    expect(status.healthy).toBe(false);
    expect(status.detail).toMatch(/last poll failed/i);

    mockGetEntries.mockResolvedValueOnce([[]]);
    await adapter.poll();

    status = await adapter.getStatus();
    expect(status.healthy).toBe(true);
  });
});
