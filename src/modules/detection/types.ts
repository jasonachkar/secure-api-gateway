import type {
  CloudProvider,
  DataProvenance,
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
  /** Static toggle - not currently exposed as a runtime admin control, but part of the rule-health contract (see rule-health.ts / docs/DETECTION_RULES.md) rather than assumed true everywhere. */
  enabled: boolean;
  /** Which provenance this rule has a real, verified signal producer for - see docs/DETECTION_RULES.md. Do not list 'live' here unless a live/scenario code path genuinely calls this rule with real data (see test evidence). */
  supportedProvenance: DataProvenance[];
  /** Paths to the test file(s) that exercise this rule - part of the rule-health contract, not just documentation. */
  testPaths: string[];
  evaluate(
    event: NormalizedSecurityEvent,
    context: DetectionContext
  ): Promise<DetectionResult | null> | DetectionResult | null;
}

export type { DetectionResult };
