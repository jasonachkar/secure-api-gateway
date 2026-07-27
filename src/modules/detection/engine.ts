import type { DetectionContext, DetectionRule } from './types.js';
import type { DetectionResult, NormalizedSecurityEvent } from '../security/types.js';
import { allRules } from './rules/index.js';
import type { PipelineMetrics } from '../security/pipeline-metrics.js';
import type { RuleHealthTracker, RuleHealthCounters } from './rule-health.js';
import { logger } from '../../lib/logger.js';

export interface RuleHealth extends RuleHealthCounters {
  id: string;
  name: string;
  version: string;
  enabled: boolean;
  severity: DetectionRule['severity'];
  providers: DetectionRule['providers'];
  supportedProvenance: DetectionRule['supportedProvenance'];
  testPaths: string[];
}

export class DetectionEngine {
  constructor(
    private readonly rules: DetectionRule[] = allRules,
    private readonly metrics?: PipelineMetrics,
    private readonly ruleHealth?: RuleHealthTracker
  ) {}

  getRules(): DetectionRule[] {
    return [...this.rules];
  }

  getRule(id: string): DetectionRule | undefined {
    return this.rules.find((r) => r.id === id);
  }

  /** Combined static rule metadata + tracked runtime counters, for GET /admin/security/rules. */
  async getRuleHealth(): Promise<RuleHealth[]> {
    if (!this.ruleHealth) {
      return this.rules.map((rule) => ({
        id: rule.id,
        name: rule.name,
        version: rule.version,
        enabled: rule.enabled,
        severity: rule.severity,
        providers: rule.providers,
        supportedProvenance: rule.supportedProvenance,
        testPaths: rule.testPaths,
        evaluationCount: 0,
        matchCount: 0,
        errorCount: 0,
      }));
    }

    const counters = await this.ruleHealth.getAllCounters(this.rules.map((r) => r.id));
    return this.rules.map((rule) => ({
      id: rule.id,
      name: rule.name,
      version: rule.version,
      enabled: rule.enabled,
      severity: rule.severity,
      providers: rule.providers,
      supportedProvenance: rule.supportedProvenance,
      testPaths: rule.testPaths,
      ...counters[rule.id],
    }));
  }

  async evaluate(
    event: NormalizedSecurityEvent,
    context: DetectionContext = {}
  ): Promise<DetectionResult[]> {
    const matches: DetectionResult[] = [];

    for (const rule of this.rules) {
      if (!rule.enabled) continue;
      if (rule.providers.length > 0 && !rule.providers.includes(event.provider)) {
        continue;
      }

      // Isolated per rule: one rule throwing must never stop the rest of the ruleset
      // from evaluating a real event, or take down the whole ingestion pipeline call.
      let result: DetectionResult | null = null;
      try {
        result = await rule.evaluate(event, context);
      } catch (error) {
        await this.metrics?.recordDetectionEvaluation(false);
        await this.ruleHealth?.recordError(rule.id, error instanceof Error ? error.message : 'Unknown rule error');
        logger.error({ error, ruleId: rule.id, eventId: event.id }, 'Detection rule threw during evaluation');
        continue;
      }

      await this.metrics?.recordDetectionEvaluation(Boolean(result));
      await this.ruleHealth?.recordEvaluation(rule.id, Boolean(result));
      if (result) {
        matches.push(result);
      }
    }

    return matches;
  }
}
