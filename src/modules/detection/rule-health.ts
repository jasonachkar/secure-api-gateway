/**
 * Per-rule health tracking: evaluation/match/error counts and last-evaluated/matched
 * timestamps, keyed by rule id. Complements the static metadata already on each
 * DetectionRule (id/version/severity/providers/supportedProvenance/enabled) with the
 * runtime state that can only be known by actually running the rule - see
 * docs/DETECTION_RULES.md.
 */
import Redis from 'ioredis';

const HEALTH_KEY_PREFIX = 'sec:rule-health:';

export interface RuleHealthCounters {
  evaluationCount: number;
  matchCount: number;
  errorCount: number;
  lastEvaluatedAt?: number;
  lastMatchedAt?: number;
  lastErrorAt?: number;
  lastErrorMessage?: string;
}

export class RuleHealthTracker {
  constructor(private readonly redis: Redis) {}

  async recordEvaluation(ruleId: string, matched: boolean): Promise<void> {
    const key = `${HEALTH_KEY_PREFIX}${ruleId}`;
    const pipeline = this.redis.pipeline();
    pipeline.hincrby(key, 'evaluationCount', 1);
    pipeline.hset(key, 'lastEvaluatedAt', Date.now());
    if (matched) {
      pipeline.hincrby(key, 'matchCount', 1);
      pipeline.hset(key, 'lastMatchedAt', Date.now());
    }
    await pipeline.exec();
  }

  async recordError(ruleId: string, message: string): Promise<void> {
    const key = `${HEALTH_KEY_PREFIX}${ruleId}`;
    const pipeline = this.redis.pipeline();
    pipeline.hincrby(key, 'errorCount', 1);
    pipeline.hset(key, 'lastErrorAt', Date.now());
    pipeline.hset(key, 'lastErrorMessage', message.slice(0, 500));
    await pipeline.exec();
  }

  async getCounters(ruleId: string): Promise<RuleHealthCounters> {
    const raw = await this.redis.hgetall(`${HEALTH_KEY_PREFIX}${ruleId}`);
    const num = (v: string | undefined) => (v ? Number(v) || 0 : 0);
    return {
      evaluationCount: num(raw.evaluationCount),
      matchCount: num(raw.matchCount),
      errorCount: num(raw.errorCount),
      lastEvaluatedAt: raw.lastEvaluatedAt ? num(raw.lastEvaluatedAt) : undefined,
      lastMatchedAt: raw.lastMatchedAt ? num(raw.lastMatchedAt) : undefined,
      lastErrorAt: raw.lastErrorAt ? num(raw.lastErrorAt) : undefined,
      lastErrorMessage: raw.lastErrorMessage,
    };
  }

  async getAllCounters(ruleIds: string[]): Promise<Record<string, RuleHealthCounters>> {
    const entries = await Promise.all(ruleIds.map(async (id) => [id, await this.getCounters(id)] as const));
    return Object.fromEntries(entries);
  }
}
