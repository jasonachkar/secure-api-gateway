/**
 * CloudWatch ingestion adapter unit tests
 * Mocks the AWS SDK client - follows the jest.mock + jest.resetModules + require
 * convention used in test/httpClient.unit.test.ts. Verifies the adapter's own
 * responsibilities (polling, pagination, cursor advancement, message unwrapping, status
 * tracking) against a mocked `ingest` function - the canonical pipeline itself is covered
 * separately in test/cloudwatch-adapter-pipeline.integration.test.ts.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const mockSend = jest.fn();

jest.mock('@aws-sdk/client-cloudwatch-logs', () => ({
  __esModule: true,
  CloudWatchLogsClient: jest.fn().mockImplementation(() => ({ send: mockSend })),
  FilterLogEventsCommand: jest.fn().mockImplementation((input: unknown) => ({ input })),
}));

describe('CloudWatchAdapter', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let CloudWatchAdapter: any;
  let cursorStore: { getCursor: jest.Mock; setCursor: jest.Mock };
  let ingest: jest.Mock;

  beforeEach(() => {
    jest.resetModules();
    mockSend.mockReset();

    cursorStore = {
      getCursor: jest.fn().mockResolvedValue(null),
      setCursor: jest.fn().mockResolvedValue(undefined),
    };
    ingest = jest.fn().mockResolvedValue({ duplicate: false });

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    ({ CloudWatchAdapter } = require('../src/modules/ingestion/adapters/cloudwatch.adapter.js'));
  });

  it('reports not configured when the log group or region is missing', async () => {
    const adapter = new CloudWatchAdapter(undefined, 'us-east-1', cursorStore, ingest, 60000);

    const status = await adapter.getStatus();

    expect(status.configured).toBe(false);
    expect(status.healthy).toBe(false);
    expect(status.detail).toMatch(/missing/i);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('parses a single JSON-encoded CloudTrail record per log event and ingests it', async () => {
    cursorStore.getCursor.mockResolvedValue('500');
    const record = { eventID: 'e1', eventName: 'ConsoleLogin', eventTime: '2026-01-01T00:00:00Z' };
    mockSend.mockResolvedValueOnce({
      events: [{ timestamp: 1000, message: JSON.stringify(record), logStreamName: 'stream-1', eventId: 'e1' }],
      nextToken: undefined,
    });

    const adapter = new CloudWatchAdapter('my-log-group', 'us-east-1', cursorStore, ingest, 60000);
    await adapter.poll();

    expect(ingest).toHaveBeenCalledTimes(1);
    expect(ingest).toHaveBeenCalledWith(record);
    expect(cursorStore.setCursor).toHaveBeenCalledWith('cloudwatch', '1001');

    const status = await adapter.getStatus();
    expect(status.configured).toBe(true);
    expect(status.healthy).toBe(true);
    expect(status.eventsReceived).toBe(1);
    expect(status.eventsIngested).toBe(1);
    expect(status.parserFailures).toBe(0);
  });

  it('unwraps a CloudTrail "Records" envelope into multiple ingested records', async () => {
    const records = [{ eventID: 'e1', eventName: 'ConsoleLogin' }, { eventID: 'e2', eventName: 'CreateAccessKey' }];
    mockSend.mockResolvedValueOnce({
      events: [{ timestamp: 1000, message: JSON.stringify({ Records: records }) }],
      nextToken: undefined,
    });

    const adapter = new CloudWatchAdapter('my-log-group', 'us-east-1', cursorStore, ingest, 60000);
    await adapter.poll();

    expect(ingest).toHaveBeenCalledTimes(2);
    expect(ingest).toHaveBeenNthCalledWith(1, records[0]);
    expect(ingest).toHaveBeenNthCalledWith(2, records[1]);
  });

  it('tracks a duplicate result from ingest() without counting it as newly ingested', async () => {
    ingest.mockResolvedValueOnce({ duplicate: true });
    mockSend.mockResolvedValueOnce({
      events: [{ timestamp: 1000, message: JSON.stringify({ eventID: 'e1', eventName: 'ConsoleLogin' }) }],
      nextToken: undefined,
    });

    const adapter = new CloudWatchAdapter('my-log-group', 'us-east-1', cursorStore, ingest, 60000);
    await adapter.poll();

    const status = await adapter.getStatus();
    expect(status.eventsIngested).toBe(0);
    expect(status.duplicatesDiscarded).toBe(1);
  });

  it('tracks a non-JSON message as a parser failure without stopping the poll', async () => {
    mockSend.mockResolvedValueOnce({
      events: [
        { timestamp: 1000, message: 'not json at all' },
        { timestamp: 1500, message: JSON.stringify({ eventID: 'e2', eventName: 'ConsoleLogin' }) },
      ],
      nextToken: undefined,
    });

    const adapter = new CloudWatchAdapter('my-log-group', 'us-east-1', cursorStore, ingest, 60000);
    await adapter.poll();

    // Both records were handed to ingest() - the unparseable one wrapped so it still
    // reaches the canonical pipeline's own (redacted, tracked) parser-failure path.
    expect(ingest).toHaveBeenCalledTimes(2);
    expect(ingest).toHaveBeenNthCalledWith(1, { unparseableMessage: 'not json at all' });
  });

  it('tracks a failure from ingest() (e.g. a genuine parser rejection) without stopping the poll', async () => {
    ingest.mockRejectedValueOnce(new Error('AWS event missing provider event ID'));
    mockSend.mockResolvedValueOnce({
      events: [
        { timestamp: 1000, message: JSON.stringify({ notAnEvent: true }) },
        { timestamp: 1500, message: JSON.stringify({ eventID: 'e2', eventName: 'ConsoleLogin' }) },
      ],
      nextToken: undefined,
    });

    const adapter = new CloudWatchAdapter('my-log-group', 'us-east-1', cursorStore, ingest, 60000);
    await adapter.poll();

    expect(ingest).toHaveBeenCalledTimes(2);
    const status = await adapter.getStatus();
    expect(status.parserFailures).toBe(1);
    expect(status.eventsIngested).toBe(1);
  });

  it('does not advance the cursor when a poll returns no events', async () => {
    mockSend.mockResolvedValueOnce({ events: [], nextToken: undefined });

    const adapter = new CloudWatchAdapter('my-log-group', 'us-east-1', cursorStore, ingest, 60000);
    await adapter.poll();

    expect(ingest).not.toHaveBeenCalled();
    expect(cursorStore.setCursor).not.toHaveBeenCalled();
  });

  it('marks unhealthy after repeated poll failures, and recovers after a success', async () => {
    mockSend.mockRejectedValue(new Error('boom'));

    const adapter = new CloudWatchAdapter('my-log-group', 'us-east-1', cursorStore, ingest, 60000);
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
    cursorStore.getCursor.mockResolvedValue('500');
    mockSend
      .mockResolvedValueOnce({ events: [{ timestamp: 1000, message: JSON.stringify({ eventID: 'a' }) }], nextToken: 'page-2' })
      .mockResolvedValueOnce({ events: [{ timestamp: 1500, message: JSON.stringify({ eventID: 'b' }) }], nextToken: undefined });

    const adapter = new CloudWatchAdapter('my-log-group', 'us-east-1', cursorStore, ingest, 60000);
    await adapter.poll();

    expect(mockSend).toHaveBeenCalledTimes(2);
    expect(ingest).toHaveBeenCalledTimes(2);
  });

  it('reports the current cursor position in status', async () => {
    cursorStore.getCursor.mockResolvedValue('123456789');
    const adapter = new CloudWatchAdapter('my-log-group', 'us-east-1', cursorStore, ingest, 60000);

    const status = await adapter.getStatus();
    expect(status.cursor).toBe('123456789');
  });

  describe('start/stop lifecycle', () => {
    afterEach(() => {
      jest.useRealTimers();
    });

    it('polls immediately on start and stops polling after stop()', async () => {
      jest.useFakeTimers();
      mockSend.mockResolvedValue({ events: [], nextToken: undefined });

      const adapter = new CloudWatchAdapter('my-log-group', 'us-east-1', cursorStore, ingest, 60000);
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
      const adapter = new CloudWatchAdapter(undefined, undefined, cursorStore, ingest, 60000);
      adapter.start();
      adapter.stop();
      expect(mockSend).not.toHaveBeenCalled();
    });
  });
});
