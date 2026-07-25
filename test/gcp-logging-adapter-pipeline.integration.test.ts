/**
 * Live GCP ingestion, end to end: GcpLoggingAdapter receives a raw Cloud Logging entry ->
 * reshapes it into the provider-native record shape -> the canonical security ingestion
 * pipeline parses it with the real GCP parser -> persists it as a NormalizedSecurityEvent
 * with provenance 'live' -> the real detection engine evaluates it -> a matching rule
 * creates a real investigation. Mocks only the @google-cloud/logging client; everything
 * from the adapter's entry-reshaping outward is the genuine production code path against
 * a real Redis.
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import Redis from 'ioredis';

const mockGetEntries = jest.fn();

jest.mock('@google-cloud/logging', () => ({
  __esModule: true,
  Logging: jest.fn().mockImplementation(() => ({ getEntries: mockGetEntries })),
}));

const VALID_KEY = JSON.stringify({ client_email: 'test@example.iam.gserviceaccount.com', private_key: 'fake' });

describe('GcpLoggingAdapter -> canonical pipeline -> detection (Integration)', () => {
  let redis: Redis;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let GcpLoggingAdapter: any;
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
    mockGetEntries.mockReset();

    redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      db: parseInt(process.env.REDIS_DB || '0', 10),
    });
    await redis.flushdb();

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    ({ GcpLoggingAdapter } = require('../src/modules/ingestion/adapters/gcp-logging.adapter.js'));
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
      const result = await ingestProviderEvent(deps, { provider: 'gcp', raw, provenance: 'live', sourceServiceOnFailure: 'my-project' });
      return { duplicate: result.duplicate };
    };
    return new GcpLoggingAdapter('my-project', VALID_KEY, cursorStore, ingest, 60000);
  }

  it('a service-account key creation audit log entry reaches GCP-IAM-001 and creates a live-provenance investigation', async () => {
    mockGetEntries.mockResolvedValueOnce([
      [
        {
          metadata: {
            insertId: 'insert-sa-key-1',
            logName: 'projects/my-project/logs/cloudaudit.googleapis.com%2Factivity',
            timestamp: new Date('2026-01-01T00:00:00Z'),
            severity: 'NOTICE',
            resource: { type: 'service_account', labels: { project_id: 'my-project' } },
          },
          data: {
            serviceName: 'iam.googleapis.com',
            methodName: 'google.iam.admin.v1.CreateServiceAccountKey',
            resourceName: 'projects/my-project/serviceAccounts/runner@my-project.iam.gserviceaccount.com',
            authenticationInfo: { principalEmail: 'admin@example.com' },
            requestMetadata: { callerIp: '198.51.100.10' },
          },
        },
      ],
    ]);

    const adapter = buildAdapter();
    await adapter.poll();

    const events = await deps.securityEventStore.listEvents({ provider: 'gcp' });
    expect(events).toHaveLength(1);
    expect(events[0].provenance).toBe('live');
    expect(events[0].providerEventId).toBe('insert-sa-key-1');

    const investigations = await deps.investigationService.listInvestigations({});
    expect(investigations.length).toBeGreaterThan(0);
    expect(investigations[0].providerScopes).toContain('gcp');
    expect(investigations[0].provenance).toBe('live');

    const detections = await deps.detectionStore.getByIds(investigations[0].detectionIds);
    expect(detections.some((d: { ruleId: string }) => d.ruleId === 'GCP-IAM-001')).toBe(true);

    const status = await adapter.getStatus();
    expect(status.eventsIngested).toBe(1);
    expect(status.parserFailures).toBe(0);
  });

  it('an entry with no insertId is tracked as a redacted parser failure without blocking a valid entry in the same poll', async () => {
    mockGetEntries.mockResolvedValueOnce([
      [
        { metadata: { timestamp: new Date('2026-01-01T00:00:00Z') }, data: { note: 'no insertId, password: hunter2' } },
        {
          metadata: {
            insertId: 'insert-2',
            timestamp: new Date('2026-01-01T00:00:01Z'),
            resource: {},
          },
          data: { methodName: 'x' },
        },
      ],
    ]);

    const adapter = buildAdapter();
    await adapter.poll();

    const status = await adapter.getStatus();
    expect(status.parserFailures).toBe(1);
    expect(status.eventsIngested).toBe(1);
    expect(await deps.securityEventStore.countParserFailures()).toBe(1);
  });
});
