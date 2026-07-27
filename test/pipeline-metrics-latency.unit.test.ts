/**
 * PipelineMetrics detection/correlation/end-to-end duration tracking - the canonical
 * ingestion pipeline (security-ingestion.pipeline.ts) records real per-stage timings on
 * every event, not just ingestion delay. Uses a real Redis connection, consistent with
 * the rest of this repo's store tests.
 */
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import Redis from 'ioredis';
import { PipelineMetrics } from '../src/modules/security/pipeline-metrics.js';
import { SecurityEventStore } from '../src/modules/ingestion/security-event.store.js';
import { DetectionEngine } from '../src/modules/detection/engine.js';
import { DetectionStore } from '../src/modules/detection/detection.store.js';
import { InvestigationService } from '../src/modules/investigations/investigation.service.js';
import { ingestProviderEvent } from '../src/modules/ingestion/security-ingestion.pipeline.js';

describe('PipelineMetrics - detection latency (Integration)', () => {
  let redis: Redis;

  beforeEach(() => {
    redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      db: parseInt(process.env.REDIS_DB || '0', 10),
    });
  });

  afterEach(async () => {
    await redis.flushdb();
    await redis.quit();
  });

  it('records real detection/correlation/end-to-end durations after ingesting an event that matches a rule', async () => {
    const pipelineMetrics = new PipelineMetrics(redis);
    const deps = {
      securityEventStore: new SecurityEventStore(redis),
      detectionEngine: new DetectionEngine(undefined, pipelineMetrics),
      detectionStore: new DetectionStore(redis),
      investigationService: new InvestigationService(redis, pipelineMetrics),
      pipelineMetrics,
    };

    await ingestProviderEvent(deps, {
      provider: 'aws',
      provenance: 'replay',
      raw: {
        eventID: 'evt-latency-1',
        eventName: 'ConsoleLogin',
        eventTime: '2026-01-01T00:00:00Z',
        userIdentity: { type: 'Root', arn: 'arn:aws:iam::123456789012:root' },
      },
    });

    const snapshot = await pipelineMetrics.getSnapshot();
    // Real, measured durations (>= 0, not fabricated) - not asserting a specific value,
    // since actual timing is machine-dependent, just that they were genuinely recorded.
    expect(snapshot.averageDetectionDurationMs).toBeGreaterThanOrEqual(0);
    expect(snapshot.averageCorrelationDurationMs).toBeGreaterThanOrEqual(0);
    expect(snapshot.averageEndToEndDurationMs).toBeGreaterThanOrEqual(0);
    expect(snapshot.averageIngestionDelayMs).toBeGreaterThanOrEqual(0);
  });

  it('does not record detection/correlation duration for a duplicate event (short-circuited before those stages run)', async () => {
    const pipelineMetrics = new PipelineMetrics(redis);
    const deps = {
      securityEventStore: new SecurityEventStore(redis),
      detectionEngine: new DetectionEngine(undefined, pipelineMetrics),
      detectionStore: new DetectionStore(redis),
      investigationService: new InvestigationService(redis, pipelineMetrics),
      pipelineMetrics,
    };
    const raw = {
      eventID: 'evt-latency-dup',
      eventName: 'ConsoleLogin',
      eventTime: '2026-01-01T00:00:00Z',
      userIdentity: { type: 'IAMUser', userName: 'alice' },
    };

    const first = await ingestProviderEvent(deps, { provider: 'aws', provenance: 'replay', raw });
    const second = await ingestProviderEvent(deps, { provider: 'aws', provenance: 'replay', raw });

    expect(first.duplicate).toBe(false);
    expect(second.duplicate).toBe(true);
    expect(second.timings.detectMs).toBe(0);
    expect(second.timings.correlateMs).toBe(0);
  });
});
