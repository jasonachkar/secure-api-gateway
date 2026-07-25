/**
 * Live AWS ingestion, end to end: CloudWatchAdapter receives a raw CloudWatch Logs
 * event -> unwraps/parses the message -> the canonical security ingestion pipeline
 * parses it with the real AWS parser -> persists it as a NormalizedSecurityEvent with
 * provenance 'live' -> the real detection engine evaluates it -> a matching rule creates
 * a real investigation. Mocks only the AWS SDK client; everything from the adapter's
 * message-unwrapping outward is the genuine production code path against a real Redis.
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import Redis from 'ioredis';

const mockSend = jest.fn();

jest.mock('@aws-sdk/client-cloudwatch-logs', () => ({
  __esModule: true,
  CloudWatchLogsClient: jest.fn().mockImplementation(() => ({ send: mockSend })),
  FilterLogEventsCommand: jest.fn().mockImplementation((input: unknown) => ({ input })),
}));

describe('CloudWatchAdapter -> canonical pipeline -> detection (Integration)', () => {
  let redis: Redis;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let CloudWatchAdapter: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let ingestProviderEvent: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let SecurityEventStore: any, DetectionEngine: any, DetectionStore: any, InvestigationService: any, PipelineMetrics: any, NormalizedEventStore: any;

  let deps: {
    securityEventStore: InstanceType<typeof SecurityEventStore>;
    detectionEngine: InstanceType<typeof DetectionEngine>;
    detectionStore: InstanceType<typeof DetectionStore>;
    investigationService: InstanceType<typeof InvestigationService>;
    pipelineMetrics: InstanceType<typeof PipelineMetrics>;
  };
  let cursorStore: InstanceType<typeof NormalizedEventStore>;

  beforeEach(async () => {
    jest.resetModules();
    mockSend.mockReset();

    redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      db: parseInt(process.env.REDIS_DB || '0', 10),
    });
    await redis.flushdb();

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    ({ CloudWatchAdapter } = require('../src/modules/ingestion/adapters/cloudwatch.adapter.js'));
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    ({ ingestProviderEvent } = require('../src/modules/ingestion/security-ingestion.pipeline.js'));
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    ({ SecurityEventStore } = require('../src/modules/ingestion/security-event.store.js'));
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    ({ DetectionEngine } = require('../src/modules/detection/engine.js'));
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    ({ DetectionStore } = require('../src/modules/detection/detection.store.js'));
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    ({ InvestigationService } = require('../src/modules/investigations/investigation.service.js'));
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    ({ PipelineMetrics } = require('../src/modules/security/pipeline-metrics.js'));
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    ({ NormalizedEventStore } = require('../src/modules/ingestion/normalized-event.store.js'));

    const pipelineMetrics = new PipelineMetrics(redis);
    deps = {
      securityEventStore: new SecurityEventStore(redis),
      detectionEngine: new DetectionEngine(undefined, pipelineMetrics),
      detectionStore: new DetectionStore(redis),
      investigationService: new InvestigationService(redis, pipelineMetrics),
      pipelineMetrics,
    };
    cursorStore = new NormalizedEventStore(redis);
  });

  afterEach(async () => {
    await redis.flushdb();
    await redis.quit();
  });

  function buildAdapter() {
    const ingest = async (raw: unknown) => {
      const result = await ingestProviderEvent(deps, { provider: 'aws', raw, provenance: 'live', sourceServiceOnFailure: 'my-log-group' });
      return { duplicate: result.duplicate };
    };
    return new CloudWatchAdapter('my-log-group', 'us-east-1', cursorStore, ingest, 60000);
  }

  it('root-account CloudTrail activity reaches AWS-IAM-001 and creates a live-provenance investigation', async () => {
    const cloudTrailRecord = {
      eventID: 'evt-root-1',
      eventName: 'ConsoleLogin',
      eventTime: '2026-01-01T00:00:00Z',
      eventSource: 'signin.amazonaws.com',
      awsRegion: 'us-east-1',
      recipientAccountId: '123456789012',
      sourceIPAddress: '198.51.100.5',
      userIdentity: { type: 'Root', principalId: '123456789012', arn: 'arn:aws:iam::123456789012:root' },
    };
    mockSend.mockResolvedValueOnce({
      events: [{ timestamp: 1700000000000, message: JSON.stringify(cloudTrailRecord) }],
      nextToken: undefined,
    });

    const adapter = buildAdapter();
    await adapter.poll();

    const events = await deps.securityEventStore.listEvents({ provider: 'aws' });
    expect(events).toHaveLength(1);
    expect(events[0].provenance).toBe('live');
    expect(events[0].providerEventId).toBe('evt-root-1');

    const detections = await deps.detectionStore.getByIds(
      (await deps.investigationService.listInvestigations({})).flatMap((i: { detectionIds: string[] }) => i.detectionIds)
    );
    expect(detections.some((d: { ruleId: string }) => d.ruleId === 'AWS-IAM-001')).toBe(true);

    const investigations = await deps.investigationService.listInvestigations({});
    expect(investigations.length).toBeGreaterThan(0);
    expect(investigations[0].providerScopes).toContain('aws');
    expect(investigations[0].provenance).toBe('live');

    const status = await adapter.getStatus();
    expect(status.eventsIngested).toBe(1);
    expect(status.parserFailures).toBe(0);
  });

  it('a malformed record in the same poll is tracked as a redacted parser failure without blocking the valid record', async () => {
    mockSend.mockResolvedValueOnce({
      events: [
        { timestamp: 1700000000000, message: JSON.stringify({ notAnEvent: true, password: 'hunter2' }) },
        {
          timestamp: 1700000001000,
          message: JSON.stringify({
            eventID: 'evt-2',
            eventName: 'CreateAccessKey',
            eventTime: '2026-01-01T00:00:01Z',
            userIdentity: { type: 'IAMUser', userName: 'alice' },
          }),
        },
      ],
      nextToken: undefined,
    });

    const adapter = buildAdapter();
    await adapter.poll();

    const status = await adapter.getStatus();
    expect(status.parserFailures).toBe(1);
    expect(status.eventsIngested).toBe(1);

    expect(await deps.securityEventStore.countParserFailures()).toBe(1);
    const events = await deps.securityEventStore.listEvents({ provider: 'aws' });
    expect(events.some((e: { providerEventId: string }) => e.providerEventId === 'evt-2')).toBe(true);
  });
});
