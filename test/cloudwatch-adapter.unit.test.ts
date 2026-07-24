/**
 * CloudWatch ingestion adapter unit tests
 * Mocks the AWS SDK client - follows the jest.mock + jest.resetModules + require
 * convention used in test/httpClient.unit.test.ts.
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

const mockSend = jest.fn();

jest.mock('@aws-sdk/client-cloudwatch-logs', () => ({
  __esModule: true,
  CloudWatchLogsClient: jest.fn().mockImplementation(() => ({ send: mockSend })),
  FilterLogEventsCommand: jest.fn().mockImplementation((input: unknown) => ({ input })),
}));

describe('CloudWatchAdapter', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let CloudWatchAdapter: any;
  let store: { getCursor: jest.Mock; setCursor: jest.Mock };
  let onEvent: jest.Mock;

  beforeEach(() => {
    jest.resetModules();
    mockSend.mockReset();

    store = {
      getCursor: jest.fn().mockResolvedValue(null),
      setCursor: jest.fn().mockResolvedValue(undefined),
    };
    onEvent = jest.fn().mockResolvedValue(undefined);

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    ({ CloudWatchAdapter } = require('../src/modules/ingestion/adapters/cloudwatch.adapter.js'));
  });

  it('reports not configured when the log group or region is missing', async () => {
    const adapter = new CloudWatchAdapter(undefined, 'us-east-1', store, onEvent, 60000);

    const status = await adapter.getStatus();

    expect(status.configured).toBe(false);
    expect(status.healthy).toBe(false);
    expect(status.detail).toMatch(/missing/i);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('polls, normalizes events, advances the cursor, and reports healthy status', async () => {
    store.getCursor.mockResolvedValue('500');
    mockSend.mockResolvedValueOnce({
      events: [
        { timestamp: 1000, message: 'hello', logStreamName: 'stream-1', eventId: 'e1' },
        { timestamp: 2000, message: 'world', logStreamName: 'stream-1', eventId: 'e2' },
      ],
      nextToken: undefined,
    });

    const adapter = new CloudWatchAdapter('my-log-group', 'us-east-1', store, onEvent, 60000);
    await adapter.poll();

    expect(onEvent).toHaveBeenCalledTimes(2);
    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event_type: 'cloudwatch_log',
        source: 'my-log-group',
        timestamp: 1000,
      })
    );
    expect(store.setCursor).toHaveBeenCalledWith('cloudwatch', '2001');

    const status = await adapter.getStatus();
    expect(status.configured).toBe(true);
    expect(status.healthy).toBe(true);
    expect(status.lastSyncAt).toBeDefined();
    expect(status.detail).toMatch(/last synced/i);
  });

  it('does not advance the cursor when a poll returns no events', async () => {
    mockSend.mockResolvedValueOnce({ events: [], nextToken: undefined });

    const adapter = new CloudWatchAdapter('my-log-group', 'us-east-1', store, onEvent, 60000);
    await adapter.poll();

    expect(onEvent).not.toHaveBeenCalled();
    expect(store.setCursor).not.toHaveBeenCalled();
  });

  it('marks unhealthy after repeated poll failures, and recovers after a success', async () => {
    mockSend.mockRejectedValue(new Error('boom'));

    const adapter = new CloudWatchAdapter('my-log-group', 'us-east-1', store, onEvent, 60000);
    await adapter.poll();
    await adapter.poll();
    await adapter.poll();

    let status = await adapter.getStatus();
    expect(status.healthy).toBe(false);
    expect(status.detail).toMatch(/last poll failed/i);

    mockSend.mockResolvedValueOnce({ events: [], nextToken: undefined });
    await adapter.poll();

    status = await adapter.getStatus();
    expect(status.healthy).toBe(true);
  });

  it('paginates via nextToken until exhausted', async () => {
    store.getCursor.mockResolvedValue('500');
    mockSend
      .mockResolvedValueOnce({ events: [{ timestamp: 1000, message: 'a' }], nextToken: 'page-2' })
      .mockResolvedValueOnce({ events: [{ timestamp: 1500, message: 'b' }], nextToken: undefined });

    const adapter = new CloudWatchAdapter('my-log-group', 'us-east-1', store, onEvent, 60000);
    await adapter.poll();

    expect(mockSend).toHaveBeenCalledTimes(2);
    expect(onEvent).toHaveBeenCalledTimes(2);
  });

  describe('start/stop lifecycle', () => {
    afterEach(() => {
      jest.useRealTimers();
    });

    it('polls immediately on start and stops polling after stop()', async () => {
      jest.useFakeTimers();
      mockSend.mockResolvedValue({ events: [], nextToken: undefined });

      const adapter = new CloudWatchAdapter('my-log-group', 'us-east-1', store, onEvent, 60000);
      adapter.start();
      await Promise.resolve();
      await Promise.resolve();

      expect(mockSend).toHaveBeenCalledTimes(1);

      adapter.stop();
      jest.advanceTimersByTime(120000);
      await Promise.resolve();

      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it('does nothing when not configured', () => {
      const adapter = new CloudWatchAdapter(undefined, undefined, store, onEvent, 60000);
      adapter.start();
      adapter.stop();
      expect(mockSend).not.toHaveBeenCalled();
    });
  });
});
