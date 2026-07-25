import type {
  CloudProvider,
  DetectionResult,
  NormalizedSecurityEvent,
  SecurityEventCategory,
  SecuritySeverity,
} from '../security/types.js';

export interface DetectionContext {
  /** Recent related events for multi-event rules */
  recentEvents?: NormalizedSecurityEvent[];
  /** Failed login count for source IP in window */
  failedLoginCount?: number;
  /** Distinct source IPs targeting same principal */
  distinctSourceIps?: number;
  now?: Date;
}

export interface DetectionRule {
  id: string;
  name: string;
  description: string;
  version: string;
  severity: SecuritySeverity;
  providers: CloudProvider[];
  categories: SecurityEventCategory[];
  severityRationale: string;
  falsePositiveNotes: string[];
  remediation: string[];
  evaluate(
    event: NormalizedSecurityEvent,
    context: DetectionContext
  ): Promise<DetectionResult | null> | DetectionResult | null;
}

export type { DetectionResult };
