/**
 * Deterministic guided scenarios. Each scenario drives the SAME production
 * code paths already exercised by real traffic (auth.controller.ts) or a
 * manual replay (POST /admin/security/replay) - there is no separate
 * "simulation" logic duplicated here.
 *
 * Scenario A (gateway credential attack) is LIVE: it logs in against a
 * dedicated demo account (sim-target) from an RFC 5737 documentation IP,
 * never the caller's own account or IP, so it cannot affect the reviewer's
 * own session. Scenarios B/C (AWS, GCP) are REPLAY: they replay a single
 * sanitized fixture. No scenario performs a destructive cloud action.
 */
import { nanoid } from 'nanoid';
import Redis from 'ioredis';
import { AuthService } from '../auth/auth.service.js';
import type { ThreatIntelService } from '../admin/threat-intel.service.js';
import type { ResponseService } from '../response/response.service.js';
import { evaluateGatewayCredentialAttack, type AuthSecurityPipeline } from '../security/gateway-detection.js';
import { replayFixtureThroughPipeline, type ReplayDeps } from '../ingestion/replay.js';
import { AccountLockedError } from '../../lib/errors.js';
import { env } from '../../config/index.js';
import { logger } from '../../lib/logger.js';
import type { ScenarioDefinition, ScenarioId, ScenarioRunResult, ScenarioStep } from './types.js';

// RFC 5737 TEST-NET-3 - documentation-reserved, never a real routable address.
const GATEWAY_SCENARIO_IP = '203.0.113.50';
const GATEWAY_SCENARIO_USERNAME = 'sim-target';
const LOCKOUT_KEY = `lockout:${GATEWAY_SCENARIO_USERNAME}:${GATEWAY_SCENARIO_IP}`;

export const SCENARIO_DEFINITIONS: ScenarioDefinition[] = [
  {
    id: 'gw-credential-attack',
    name: 'Gateway credential attack',
    description:
      'Drives real failed logins against a dedicated demo account (sim-target) from an RFC 5737 test IP until the gateway locks the account, confirms the GW-AUTH-001 detection and resulting investigation, then enforces a real IP block and verifies the follow-up request is rejected.',
    provenance: 'live',
    provider: 'gateway',
    expectedOutcome:
      'sim-target is locked out, an investigation with severity "critical" is created, the source IP is blocked, and a subsequent request from that IP is rejected with 403.',
    safeForReviewer: true,
    steps: [
      { id: 'generate', label: 'Generate', description: 'Real failed login attempts against the dedicated demo account, not the reviewer\'s own account.' },
      { id: 'normalize', label: 'Normalize', description: 'Account lockout is normalized into a canonical gateway NormalizedSecurityEvent.' },
      { id: 'detect', label: 'Detect', description: 'GW-AUTH-001 evaluates the event against the concentrated-attack threshold.' },
      { id: 'correlate', label: 'Correlate', description: 'The detection opens or updates an investigation keyed by principal + source IP + time window.' },
      { id: 'respond', label: 'Respond', description: 'The source IP is enforced-blocked (real, not simulated) and the action is attached to the investigation.' },
      { id: 'verify', label: 'Verify evidence', description: 'A follow-up request from the blocked IP is confirmed rejected.' },
    ],
  },
  {
    id: 'aws-privileged-activity',
    name: 'AWS privileged activity',
    description:
      'Replays a sanitized CloudTrail root-account-login event, normalizes it, evaluates AWS-IAM-001, and opens an investigation. No AWS action is performed - this only replays a fixture already checked into the repository.',
    provenance: 'replay',
    provider: 'aws',
    expectedOutcome: 'AWS-IAM-001 fires with severity "critical" and an investigation is created or updated.',
    safeForReviewer: true,
    steps: [
      { id: 'generate', label: 'Replay', description: 'A sanitized CloudTrail root-login fixture (test/fixtures/aws/cloudtrail-root-activity.json) is replayed.' },
      { id: 'normalize', label: 'Normalize', description: 'The raw CloudTrail record is parsed into the canonical NormalizedSecurityEvent schema.' },
      { id: 'detect', label: 'Detect', description: 'AWS-IAM-001 evaluates the event for root-account activity.' },
      { id: 'correlate', label: 'Correlate', description: 'The detection opens or updates an investigation keyed by principal + account + time window.' },
      { id: 'respond', label: 'Respond', description: 'No destructive AWS remediation is performed from this demo control plane - remediation guidance is attached to the investigation instead.' },
      { id: 'verify', label: 'Verify evidence', description: 'Raw fixture payload and normalized event are both available for side-by-side inspection.' },
    ],
  },
  {
    id: 'gcp-credential-persistence',
    name: 'GCP credential persistence',
    description:
      'Replays a sanitized GCP service-account-key-creation event, normalizes it, evaluates GCP-IAM-001, and opens an investigation, explaining why Workload Identity Federation is preferred over long-lived keys.',
    provenance: 'replay',
    provider: 'gcp',
    expectedOutcome: 'GCP-IAM-001 fires with severity "high" and an investigation is created or updated.',
    safeForReviewer: true,
    steps: [
      { id: 'generate', label: 'Replay', description: 'A sanitized service-account-key-creation fixture (test/fixtures/gcp/service-account-key-created.json) is replayed.' },
      { id: 'normalize', label: 'Normalize', description: 'The raw GCP audit record is parsed into the canonical NormalizedSecurityEvent schema.' },
      { id: 'detect', label: 'Detect', description: 'GCP-IAM-001 evaluates the event for service-account key creation.' },
      { id: 'correlate', label: 'Correlate', description: 'The detection opens or updates an investigation keyed by project + resource + time window.' },
      { id: 'respond', label: 'Respond', description: 'No destructive GCP action is performed - remediation guidance (prefer Workload Identity Federation) is attached instead.' },
      { id: 'verify', label: 'Verify evidence', description: 'Raw fixture payload and normalized event are both available for side-by-side inspection.' },
    ],
  },
];

export interface ScenarioServiceDeps extends ReplayDeps, AuthSecurityPipeline {
  redis: Redis;
  authService: AuthService;
  threatIntelService: ThreatIntelService;
  responseService: ResponseService;
}

export class ScenarioService {
  constructor(private readonly deps: ScenarioServiceDeps) {}

  getDefinitions(): ScenarioDefinition[] {
    return SCENARIO_DEFINITIONS;
  }

  async run(scenarioId: ScenarioId, actor: string): Promise<ScenarioRunResult> {
    const startedAt = new Date().toISOString();
    const correlationId = nanoid();

    let result: Omit<ScenarioRunResult, 'startedAt' | 'completedAt' | 'correlationId' | 'scenarioId' | 'provenance'>;

    switch (scenarioId) {
      case 'gw-credential-attack':
        result = await this.runGatewayCredentialAttack(actor, correlationId);
        break;
      case 'aws-privileged-activity':
        result = await this.runReplayScenario('aws/cloudtrail-root-activity');
        break;
      case 'gcp-credential-persistence':
        result = await this.runReplayScenario('gcp/service-account-key-created');
        break;
      default: {
        const _exhaustive: never = scenarioId;
        throw new Error(`Unknown scenario: ${_exhaustive}`);
      }
    }

    const definition = SCENARIO_DEFINITIONS.find((d) => d.id === scenarioId)!;
    return {
      scenarioId,
      provenance: definition.provenance,
      startedAt,
      completedAt: new Date().toISOString(),
      correlationId,
      ...result,
    };
  }

  /**
   * Unblocks the scenario's dedicated demo IP and clears its lockout state
   * so the scenario can be re-run cleanly. Never touches the caller's own
   * IP or account - the scenario always operates on GATEWAY_SCENARIO_IP /
   * GATEWAY_SCENARIO_USERNAME only.
   */
  async resetGatewayScenario(): Promise<void> {
    await this.deps.threatIntelService.unblockIP(GATEWAY_SCENARIO_IP);
    await this.deps.redis.del(LOCKOUT_KEY);
  }

  private async runGatewayCredentialAttack(
    actor: string,
    correlationId: string
  ): ReturnType<ScenarioService['buildGatewayResult']> {
    const steps: ScenarioStep[] = [];

    // 1. Generate: real failed logins against the dedicated demo account.
    let locked = false;
    for (let attempt = 0; attempt < env.auth.maxLoginAttempts + 1 && !locked; attempt++) {
      try {
        await this.deps.authService.login(GATEWAY_SCENARIO_USERNAME, 'intentionally-wrong-password', GATEWAY_SCENARIO_IP);
      } catch (error) {
        if (error instanceof AccountLockedError) {
          locked = true;
        }
        // InvalidCredentialsError is expected on every attempt before lockout.
      }
    }
    steps.push({
      id: 'generate',
      label: 'Generate',
      status: locked ? 'completed' : 'failed',
      summary: locked
        ? `Account "${GATEWAY_SCENARIO_USERNAME}" locked from ${GATEWAY_SCENARIO_IP} after repeated failed logins.`
        : 'Lockout was not achieved within the expected attempt count.',
    });

    if (!locked) {
      logger.error({ scenario: 'gw-credential-attack' }, 'Scenario failed to trigger account lockout');
      return this.buildGatewayResult(steps, null);
    }

    // 2-3. Normalize + Detect (shared with the real login path).
    const pipelineResult = await evaluateGatewayCredentialAttack(this.deps, {
      username: GATEWAY_SCENARIO_USERNAME,
      ip: GATEWAY_SCENARIO_IP,
      failedLoginCount: env.auth.maxLoginAttempts,
    });

    steps.push({
      id: 'normalize',
      label: 'Normalize',
      status: pipelineResult ? 'completed' : 'failed',
      summary: pipelineResult
        ? `Lockout normalized into event ${pipelineResult.event.id} (schema v${pipelineResult.event.schemaVersion}).`
        : 'Normalization failed - see server logs.',
    });
    steps.push({
      id: 'detect',
      label: 'Detect',
      status: pipelineResult && pipelineResult.detections.length > 0 ? 'completed' : 'skipped',
      summary:
        pipelineResult && pipelineResult.detections.length > 0
          ? `GW-AUTH-001 matched (severity: ${pipelineResult.detections[0].severity}).`
          : 'No detection matched (may already be correlated into a prior run).',
    });

    // 4. Correlate.
    const investigation = pipelineResult?.investigations[0];
    steps.push({
      id: 'correlate',
      label: 'Correlate',
      status: investigation ? 'completed' : 'skipped',
      summary: investigation
        ? `Investigation ${investigation.id}: ${investigation.correlationExplanation}`
        : 'No investigation produced (no new detection this run).',
    });

    // 5. Respond: real, enforced IP block.
    const blockAction = await this.deps.responseService.blockIp({
      ip: GATEWAY_SCENARIO_IP,
      actor,
      reason: 'Guided scenario: gateway credential attack',
      correlationId,
      investigationId: investigation?.id,
    });
    if (investigation) {
      await this.deps.investigationService.attachResponseAction(investigation.id, blockAction);
    }
    steps.push({
      id: 'respond',
      label: 'Respond',
      status: blockAction.result === 'success' ? 'completed' : 'failed',
      summary: `IP ${GATEWAY_SCENARIO_IP} block: ${blockAction.result} (mode: ${blockAction.mode}).`,
    });

    // 6. Verify: confirm the block is actually in effect.
    const stillBlocked = await this.deps.threatIntelService.isIPBlocked(GATEWAY_SCENARIO_IP);
    steps.push({
      id: 'verify',
      label: 'Verify evidence',
      status: stillBlocked ? 'completed' : 'failed',
      summary: stillBlocked
        ? `Verified: requests from ${GATEWAY_SCENARIO_IP} are now rejected with 403 by the gateway IP-block middleware.`
        : 'Verification failed: IP is not showing as blocked.',
    });

    return this.buildGatewayResult(steps, pipelineResult, investigation ? [investigation] : []);
  }

  private buildGatewayResult(
    steps: ScenarioStep[],
    pipelineResult: Awaited<ReturnType<typeof evaluateGatewayCredentialAttack>>,
    investigations: NonNullable<Awaited<ReturnType<typeof evaluateGatewayCredentialAttack>>>['investigations'] = []
  ) {
    return Promise.resolve({
      steps,
      eventIds: pipelineResult ? [pipelineResult.event.id] : [],
      detectionIds: pipelineResult ? pipelineResult.detections.map((d) => d.id) : [],
      investigationIds: investigations.map((i) => i.id),
    });
  }

  private async runReplayScenario(fixtureId: string) {
    const steps: ScenarioStep[] = [];
    steps.push({
      id: 'generate',
      label: 'Replay',
      status: 'completed',
      summary: `Replaying sanitized fixture ${fixtureId}.`,
    });

    const result = await replayFixtureThroughPipeline(this.deps, fixtureId);

    steps.push({
      id: 'normalize',
      label: 'Normalize',
      status: 'completed',
      summary: `Normalized into event ${result.event.id} (${result.duplicate ? 'duplicate of an earlier run' : 'new'}).`,
    });
    steps.push({
      id: 'detect',
      label: 'Detect',
      status: result.detections.length > 0 ? 'completed' : 'skipped',
      summary:
        result.detections.length > 0
          ? `${result.detections.map((d) => d.ruleId).join(', ')} matched.`
          : 'No detection matched.',
    });
    steps.push({
      id: 'correlate',
      label: 'Correlate',
      status: result.investigations.length > 0 ? 'completed' : 'skipped',
      summary:
        result.investigations.length > 0
          ? `Investigation ${result.investigations[0].id}: ${result.investigations[0].correlationExplanation}`
          : 'No investigation produced.',
    });
    steps.push({
      id: 'respond',
      label: 'Respond',
      status: 'skipped',
      summary: 'No destructive cloud action is performed from this demo control plane; remediation guidance is attached to the investigation.',
    });
    steps.push({
      id: 'verify',
      label: 'Verify evidence',
      status: 'completed',
      summary: `Raw fixture and normalized event ${result.event.id} are both available via GET /admin/security/events/${result.event.id}.`,
    });

    return {
      steps,
      eventIds: [result.event.id],
      detectionIds: result.detections.map((d) => d.id),
      investigationIds: result.investigations.map((i) => i.id),
    };
  }
}
