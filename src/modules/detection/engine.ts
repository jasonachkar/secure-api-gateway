import type { DetectionContext, DetectionRule } from './types.js';
import type { DetectionResult, NormalizedSecurityEvent } from '../security/types.js';
import { allRules } from './rules/index.js';
import type { PipelineMetrics } from '../security/pipeline-metrics.js';

export class DetectionEngine {
  constructor(
    private readonly rules: DetectionRule[] = allRules,
    private readonly metrics?: PipelineMetrics
  ) {}

  getRules(): DetectionRule[] {
    return [...this.rules];
  }

  getRule(id: string): DetectionRule | undefined {
    return this.rules.find((r) => r.id === id);
  }

  async evaluate(
    event: NormalizedSecurityEvent,
    context: DetectionContext = {}
  ): Promise<DetectionResult[]> {
    const matches: DetectionResult[] = [];

    for (const rule of this.rules) {
      if (rule.providers.length > 0 && !rule.providers.includes(event.provider)) {
        await this.metrics?.recordDetectionEvaluation(false);
        continue;
      }

      const result = await rule.evaluate(event, context);
      await this.metrics?.recordDetectionEvaluation(Boolean(result));
      if (result) {
        matches.push(result);
      }
    }

    return matches;
  }
}
