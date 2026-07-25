/**
 * Operational metrics for the security control-plane pipeline.
 * Uses fixed Redis keys / hashes — never KEYS in request paths.
 */

import Redis from 'ioredis';
import type { CloudProvider, OperationalHealth } from './types.js';

const COUNTERS_KEY = 'sec:metrics:counters';
const PROVIDER_INGESTED_KEY = 'sec:metrics:ingested_by_provider';
const PROVIDER_LAST_POLL_KEY = 'sec:metrics:last_poll';
const PROVIDER_FAILURES_KEY = 'sec:metrics:provider_failures';
const DELAY_SUM_KEY = 'sec:metrics:delay_sum_ms';
const DELAY_COUNT_KEY = 'sec:metrics:delay_count';

export interface PipelineMetricsSnapshot {
  eventsIngestedByProvider: Record<string, number>;
  eventsNormalized: number;
  duplicatesDiscarded: number;
  parserFailures: number;
  detectionEvaluations: number;
  detectionMatches: number;
  investigationsCreated: number;
  investigationDeduplications: number;
  responseActionSuccess: number;
  responseActionFailure: number;
  deadLetterCount: number;
  averageIngestionDelayMs: number;
  lastSuccessfulProviderPoll: Record<string, number>;
  consecutiveProviderFailures: Record<string, number>;
  healthByProvider: Record<CloudProvider, OperationalHealth>;
}

export class PipelineMetrics {
  constructor(private readonly redis: Redis) {}

  async incr(field: string, by = 1): Promise<void> {
    await this.redis.hincrby(COUNTERS_KEY, field, by);
  }

  async recordIngested(provider: CloudProvider): Promise<void> {
    await this.redis.hincrby(PROVIDER_INGESTED_KEY, provider, 1);
    await this.incr('eventsNormalized');
  }

  async recordDuplicate(): Promise<void> {
    await this.incr('duplicatesDiscarded');
  }

  async recordParserFailure(): Promise<void> {
    await this.incr('parserFailures');
    await this.incr('deadLetterCount');
  }

  async recordDetectionEvaluation(matched: boolean): Promise<void> {
    await this.incr('detectionEvaluations');
    if (matched) await this.incr('detectionMatches');
  }

  async recordInvestigationCreated(): Promise<void> {
    await this.incr('investigationsCreated');
  }

  async recordInvestigationDedup(): Promise<void> {
    await this.incr('investigationDeduplications');
  }

  async recordResponse(success: boolean): Promise<void> {
    await this.incr(success ? 'responseActionSuccess' : 'responseActionFailure');
  }

  async recordIngestionDelay(delayMs: number): Promise<void> {
    await this.redis.incrby(DELAY_SUM_KEY, Math.max(0, Math.floor(delayMs)));
    await this.redis.incr(DELAY_COUNT_KEY);
  }

  async recordProviderPollSuccess(provider: CloudProvider): Promise<void> {
    await this.redis.hset(PROVIDER_LAST_POLL_KEY, provider, String(Date.now()));
    await this.redis.hset(PROVIDER_FAILURES_KEY, provider, '0');
  }

  async recordProviderPollFailure(provider: CloudProvider): Promise<void> {
    await this.redis.hincrby(PROVIDER_FAILURES_KEY, provider, 1);
  }

  async getSnapshot(options?: {
    awsConfigured?: boolean;
    gcpConfigured?: boolean;
    azureMode?: 'replay' | 'live' | 'not_configured';
  }): Promise<PipelineMetricsSnapshot> {
    const [counters, ingested, lastPoll, failures, delaySum, delayCount] = await Promise.all([
      this.redis.hgetall(COUNTERS_KEY),
      this.redis.hgetall(PROVIDER_INGESTED_KEY),
      this.redis.hgetall(PROVIDER_LAST_POLL_KEY),
      this.redis.hgetall(PROVIDER_FAILURES_KEY),
      this.redis.get(DELAY_SUM_KEY),
      this.redis.get(DELAY_COUNT_KEY),
    ]);

    const num = (v: string | undefined) => (v ? Number(v) || 0 : 0);
    const delaySumN = num(delaySum ?? undefined);
    const delayCountN = num(delayCount ?? undefined);

    const consecutiveProviderFailures: Record<string, number> = {};
    const lastSuccessfulProviderPoll: Record<string, number> = {};
    for (const [k, v] of Object.entries(failures)) {
      consecutiveProviderFailures[k] = num(v);
    }
    for (const [k, v] of Object.entries(lastPoll)) {
      lastSuccessfulProviderPoll[k] = num(v);
    }

    const healthByProvider: Record<CloudProvider, OperationalHealth> = {
      gateway: 'healthy',
      aws: this.resolveHealth(
        options?.awsConfigured ?? false,
        consecutiveProviderFailures.aws ?? 0,
        lastSuccessfulProviderPoll.aws
      ),
      gcp: this.resolveHealth(
        options?.gcpConfigured ?? false,
        consecutiveProviderFailures.gcp ?? 0,
        lastSuccessfulProviderPoll.gcp
      ),
      azure:
        options?.azureMode === 'live'
          ? this.resolveHealth(true, consecutiveProviderFailures.azure ?? 0, lastSuccessfulProviderPoll.azure)
          : options?.azureMode === 'replay'
            ? 'replay_only'
            : 'not_configured',
    };

    return {
      eventsIngestedByProvider: Object.fromEntries(
        Object.entries(ingested).map(([k, v]) => [k, num(v)])
      ),
      eventsNormalized: num(counters.eventsNormalized),
      duplicatesDiscarded: num(counters.duplicatesDiscarded),
      parserFailures: num(counters.parserFailures),
      detectionEvaluations: num(counters.detectionEvaluations),
      detectionMatches: num(counters.detectionMatches),
      investigationsCreated: num(counters.investigationsCreated),
      investigationDeduplications: num(counters.investigationDeduplications),
      responseActionSuccess: num(counters.responseActionSuccess),
      responseActionFailure: num(counters.responseActionFailure),
      deadLetterCount: num(counters.deadLetterCount),
      averageIngestionDelayMs: delayCountN > 0 ? Math.round(delaySumN / delayCountN) : 0,
      lastSuccessfulProviderPoll,
      consecutiveProviderFailures,
      healthByProvider,
    };
  }

  private resolveHealth(
    configured: boolean,
    consecutiveFailures: number,
    lastSuccess?: number
  ): OperationalHealth {
    if (!configured) return 'replay_only';
    if (consecutiveFailures >= 5) return 'unavailable';
    if (consecutiveFailures >= 2) return 'degraded';
    if (!lastSuccess) return 'degraded';
    return 'healthy';
  }
}
