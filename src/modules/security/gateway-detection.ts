/**
 * Shared helper that feeds a real (non-simulated) gateway security signal
 * through the live detection -> investigation pipeline. Used by both the
 * real login path (auth.controller.ts, on account lockout) and the guided
 * gateway-credential-attack scenario (scenario.service.ts), so both go
 * through identical detection logic - the scenario is not a separate,
 * simplified simulation of GW-AUTH-001, it drives the same code path.
 */
import { nanoid } from 'nanoid';
import { logger } from '../../lib/logger.js';
import { parseGatewayEvent } from '../ingestion/parsers/gateway.parser.js';
import type { DetectionEngine } from '../detection/engine.js';
import type { DetectionStore } from '../detection/detection.store.js';
import type { SecurityEventStore } from '../ingestion/security-event.store.js';
import type { InvestigationService } from '../investigations/investigation.service.js';
import type { PipelineMetrics } from './pipeline-metrics.js';
import type { GatewayAuthTracker } from './gateway-auth-tracker.js';
import type { DetectionResult, NormalizedSecurityEvent, SecurityInvestigation } from './types.js';

export interface AuthSecurityPipeline {
  detectionEngine: DetectionEngine;
  detectionStore: DetectionStore;
  securityEventStore: SecurityEventStore;
  investigationService: InvestigationService;
  pipelineMetrics: PipelineMetrics;
  /** Optional: only the real HTTP login path (auth.controller.ts) needs this - the guided scenario evaluates with fixed, scripted numbers instead. */
  gatewayAuthTracker?: GatewayAuthTracker;
}

export interface GatewayCredentialAttackParams {
  username: string;
  ip: string;
  failedLoginCount: number;
  distinctSourceIps?: number;
  action?: string;
  title?: string;
  summary?: string;
}

export interface GatewayCredentialAttackResult {
  event: NormalizedSecurityEvent;
  duplicate: boolean;
  detections: DetectionResult[];
  investigations: SecurityInvestigation[];
}

/**
 * Best-effort: errors are logged, never thrown, so a caller on the real
 * login path can never have this break the actual login/lockout response.
 */
export async function evaluateGatewayCredentialAttack(
  pipeline: AuthSecurityPipeline,
  params: GatewayCredentialAttackParams
): Promise<GatewayCredentialAttackResult | null> {
  const { detectionEngine, detectionStore, securityEventStore, investigationService, pipelineMetrics } = pipeline;

  try {
    const event = parseGatewayEvent(
      {
        action: params.action ?? 'gateway.login_failed',
        providerEventId: `gw-auth-${params.username}-${nanoid()}`,
        occurredAt: new Date().toISOString(),
        outcome: 'failure',
        category: 'authentication',
        severity: 'high',
        title: params.title ?? 'Gateway authentication failure',
        summary: params.summary ?? `Failed login attempt against account "${params.username}"`,
        sourceIp: params.ip,
        principal: { id: params.username, displayName: params.username, type: 'user' },
      },
      'live'
    );

    const { event: saved, duplicate } = await securityEventStore.saveEvent(event);
    await pipelineMetrics.recordIngested('gateway');
    if (duplicate) {
      await pipelineMetrics.recordDuplicate();
      return { event: saved, duplicate: true, detections: [], investigations: [] };
    }

    const detections = await detectionEngine.evaluate(saved, {
      failedLoginCount: params.failedLoginCount,
      distinctSourceIps: params.distinctSourceIps ?? 1,
    });
    await detectionStore.saveAll(detections);

    const investigations: SecurityInvestigation[] = [];
    for (const detection of detections) {
      investigations.push(await investigationService.correlate(saved, detection));
    }

    return { event: saved, duplicate: false, detections, investigations };
  } catch (error) {
    logger.error({ error }, 'Failed to evaluate gateway credential-attack detection');
    return null;
  }
}
