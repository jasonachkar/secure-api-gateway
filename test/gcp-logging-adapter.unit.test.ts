/**
 * GCP Cloud Logging ingestion adapter unit tests
 * Mocks the @google-cloud/logging client - follows the jest.mock + jest.resetModules +
 * require convention used in test/httpClient.unit.test.ts. Verifies the adapter's own
 * responsibilities (polling, cursor advancement, entry reshaping, status tracking)
 * against a mocked `ingest` function - the canonical pipeline itself is covered
 * separately in test/gcp-logging-adapter-pipeline.integration.test.ts.
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
  let cursorStore: { getCursor: jest.Mock; setCursor: jest.Mock };
  let ingest: jest.Mock;

  beforeEach(() => {
    jest.resetModules();
    mockGetEntries.mockReset();

    cursorStore = {
      getCursor: jest.fn().mockResolvedValue(null),
      setCursor: jest.fn().mockResolvedValue(undefined),
    };
    ingest = jest.fn().mockResolvedValue({ duplicate: false });

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    ({ GcpLoggingAdapter } = require('../src/modules/ingestion/adapters/gcp-logging.adapter.js'));
  });

  it('reports not configured when the project id or key is missing', async () => {
    const adapter = new GcpLoggingAdapter(undefined, VALID_KEY, cursorStore, ingest, 60000);

    const status = await adapter.getStatus();

    expect(status.configured).toBe(false);
    expect(status.healthy).toBe(false);
    expect(mockGetEntries).not.toHaveBeenCalled();
  });

  it('degrades to not-configured (rather than throwing) when the service account key is malformed JSON', async () => {
    const adapter = new GcpLoggingAdapter('my-project', 'not-json', cursorStore, ingest, 60000);

    const status = await adapter.getStatus();

    expect(status.configured).toBe(false);
    expect(status.detail).toMatch(/missing/i);
  });

  it('reshapes each entry into the provider-native record the GCP parser expects and ingests it', async () => {
    cursorStore.getCursor.mockResolvedValue('500');
    const timestamp = new Date('2026-01-01T00:00:10.000Z');
    mockGetEntries.mockResolvedValueOnce([
      [
        {
          metadata: {
            timestamp,
            severity: 'ERROR',
            logName: 'projects/my-project/logs/cloudaudit.googleapis.com%2Factivity',
            insertId: 'insert-1',
            resource: { type: 'service_account' },
          },
          data: { methodName: 'google.iam.admin.v1.CreateServiceAccountKey' },
        },
      ],
    ]);

    const adapter = new GcpLoggingAdapter('my-project', VALID_KEY, cursorStore, ingest, 60000);
    await adapter.poll();

    expect(ingest).toHaveBeenCalledTimes(1);
    expect(ingest).toHaveBeenCalledWith({
      insertId: 'insert-1',
      logName: 'projects/my-project/logs/cloudaudit.googleapis.com%2Factivity',
      timestamp: timestamp.toISOString(), // Date -> string: parseGcpEvent's contract, shared with string-only replay fixtures
      severity: 'ERROR',
      resource: { type: 'service_account' },
      protoPayload: { methodName: 'google.iam.admin.v1.CreateServiceAccountKey' },
    });
    expect(cursorStore.setCursor).toHaveBeenCalledWith('gcp_logging', String(timestamp.getTime() + 1));

    const status = await adapter.getStatus();
    expect(status.healthy).toBe(true);
    expect(status.lastSyncAt).toBeDefined();
    expect(status.eventsReceived).toBe(1);
    expect(status.eventsIngested).toBe(1);
  });

  it('tracks a duplicate result from ingest() without counting it as newly ingested', async () => {
    ingest.mockResolvedValueOnce({ duplicate: true });
    mockGetEntries.mockResolvedValueOnce([
      [{ metadata: { timestamp: new Date(), insertId: 'i1' }, data: {} }],
    ]);

    const adapter = new GcpLoggingAdapter('my-project', VALID_KEY, cursorStore, ingest, 60000);
    await adapter.poll();

    const status = await adapter.getStatus();
    expect(status.eventsIngested).toBe(0);
    expect(status.duplicatesDiscarded).toBe(1);
  });

  it('tracks a failure from ingest() (e.g. a genuine parser rejection) without stopping the poll', async () => {
    ingest
      .mockRejectedValueOnce(new Error('GCP event missing insertId / provider event ID'))
      .mockResolvedValueOnce({ duplicate: false });
    mockGetEntries.mockResolvedValueOnce([
      [
        { metadata: { timestamp: new Date(1000) }, data: {} },
        { metadata: { timestamp: new Date(2000), insertId: 'i2' }, data: { methodName: 'x' } },
      ],
    ]);

    const adapter = new GcpLoggingAdapter('my-project', VALID_KEY, cursorStore, ingest, 60000);
    await adapter.poll();

    expect(ingest).toHaveBeenCalledTimes(2);
    const status = await adapter.getStatus();
    expect(status.parserFailures).toBe(1);
    expect(status.eventsIngested).toBe(1);
  });

  it('does not advance the cursor when a poll returns no entries', async () => {
    mockGetEntries.mockResolvedValueOnce([[]]);

    const adapter = new GcpLoggingAdapter('my-project', VALID_KEY, cursorStore, ingest, 60000);
    await adapter.poll();

    expect(ingest).not.toHaveBeenCalled();
    expect(cursorStore.setCursor).not.toHaveBeenCalled();
  });

  it('marks unhealthy after repeated poll failures, and recovers after a success', async () => {
    mockGetEntries.mockRejectedValue(new Error('permission denied'));

    const adapter = new GcpLoggingAdapter('my-project', VALID_KEY, cursorStore, ingest, 60000);
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

  it('reports the current cursor position in status', async () => {
    cursorStore.getCursor.mockResolvedValue('123456789');
    const adapter = new GcpLoggingAdapter('my-project', VALID_KEY, cursorStore, ingest, 60000);

    const status = await adapter.getStatus();
    expect(status.cursor).toBe('123456789');
  });
});
