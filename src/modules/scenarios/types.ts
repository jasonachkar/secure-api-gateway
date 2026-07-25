import type { CloudProvider, DataProvenance } from '../security/types.js';

export type ScenarioId = 'gw-credential-attack' | 'aws-privileged-activity' | 'gcp-credential-persistence';

export type ScenarioStepId = 'generate' | 'normalize' | 'detect' | 'correlate' | 'respond' | 'verify';

export interface ScenarioStep {
  id: ScenarioStepId;
  label: string;
  status: 'completed' | 'skipped' | 'failed';
  summary: string;
  detail?: Record<string, unknown>;
}

export interface ScenarioDefinition {
  id: ScenarioId;
  name: string;
  description: string;
  provenance: DataProvenance;
  provider: CloudProvider;
  steps: { id: ScenarioStepId; label: string; description: string }[];
  expectedOutcome: string;
  safeForReviewer: boolean;
}

export interface ScenarioRunResult {
  scenarioId: ScenarioId;
  provenance: DataProvenance;
  startedAt: string;
  completedAt: string;
  correlationId: string;
  steps: ScenarioStep[];
  eventIds: string[];
  detectionIds: string[];
  investigationIds: string[];
}
