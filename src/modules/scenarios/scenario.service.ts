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
import type { FastifyInstance } from 'fastify';
import type { ThreatIntelService } from '../admin/threat-intel.service.js';
import type { ResponseService } from '../response/response.service.js';
import type { AuditService } from '../audit/audit.service.js';
import type { AuthSecurityPipeline } from '../security/gateway-detection.js';
import { replayFixtureThroughPipeline, type ReplayDeps } from '../ingestion/replay.js';
import { env } from '../../config/index.js';
import { logger } from '../../lib/logger.js';
import type {
  DetectionResult,
  NormalizedSecurityEvent,
  SecurityInvestigation,
} from '../security/types.js';
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
  threatIntelService: ThreatIntelService;
  responseService: ResponseService;
  auditService: AuditService;
  /**
   * The real Fastify app - the gateway scenario drives its login attempts and
   * verification request through `app.inject()`, the full request lifecycle (rate
   * limiting, request context, audit hooks, AuthController's own detection wiring),
   * not a direct service-layer call. See runGatewayCredentialAttack.
   */
  app: FastifyInstance;
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
   * Unblocks the scenario's dedicated demo IP, clears its lockout state, and resets its
   * GW-AUTH-001 detection tracker so the scenario can be re-run cleanly and
   * predictably (a rerun without this would start from an already-elevated failure
   * count/IP set left over from the prior run). Never touches the caller's own IP or
   * account - the scenario always operates on GATEWAY_SCENARIO_IP /
   * GATEWAY_SCENARIO_USERNAME only.
   */
  async resetGatewayScenario(): Promise<void> {
    await this.deps.threatIntelService.unblockIP(GATEWAY_SCENARIO_IP);
    await this.deps.redis.del(LOCKOUT_KEY);
    await this.deps.gatewayAuthTracker?.reset(GATEWAY_SCENARIO_USERNAME);
  }

  /**
   * Drives the entire attack through the real HTTP request path (`app.inject()` runs
   * the full Fastify lifecycle - onRequest hooks, the auth rate limiter, request
   * context, AuthController.login()'s own audit logging and GW-AUTH-001 wiring -
   * exactly what a real client's requests go through), not a direct
   * AuthService.login() call. Detection/correlation are a side effect of those real
   * requests (auth.controller.ts already wires every failed attempt through
   * GW-AUTH-001 as of the real-signal fix - see docs/DETECTION_RULES.md), looked up
   * afterward rather than invoked a second time here. Verification sends a genuine
   * follow-up HTTP request from the now-blocked IP and checks the actual 403 response
   * plus the resulting audit entry - not a Redis membership check.
   */
  private async runGatewayCredentialAttack(
    actor: string,
    correlationId: string
  ): ReturnType<ScenarioService['buildGatewayResult']> {
    const steps: ScenarioStep[] = [];

    // 1. Generate: real HTTP POST /auth/login requests against the dedicated demo
    // account, from the dedicated demo IP - never the reviewer's own session.
    let locked = false;
    let rateLimited = false;
    let alreadyBlocked = false;
    let attemptsSent = 0;
    while (attemptsSent < env.auth.maxLoginAttempts + 1 && !locked && !rateLimited && !alreadyBlocked) {
      attemptsSent++;
      const res = await this.deps.app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { username: GATEWAY_SCENARIO_USERNAME, password: 'intentionally-wrong-password' },
        headers: { 'x-forwarded-for': GATEWAY_SCENARIO_IP },
      });
      if (res.statusCode === 429) {
        rateLimited = true;
        break;
      }
      if (res.statusCode === 403) {
        const body = res.json() as { error?: { code?: string } };
        if (body.error?.code === 'IP_BLOCKED') {
          // Idempotent rerun without a reset in between: the scenario IP is still
          // blocked from a previous run's own enforcement, which is *proof* that
          // enforcement is real and persistent (the IP-block middleware runs ahead of
          // every route, including this one) - not a scenario failure. The account was
          // necessarily already locked and reported to GW-AUTH-001 for that block to
          // exist, so treat this the same as a fresh lockout and move on to looking up
          // the existing investigation/enforcement below.
          alreadyBlocked = true;
          locked = true;
        }
      }
      if (res.statusCode === 401) {
        const body = res.json() as { error?: { code?: string } };
        if (body.error?.code === 'ACCOUNT_LOCKED') {
          locked = true;
        }
      }
    }

    steps.push({
      id: 'generate',
      label: 'Generate',
      status: locked ? 'completed' : 'failed',
      summary: alreadyBlocked
        ? `Account "${GATEWAY_SCENARIO_USERNAME}" and source IP ${GATEWAY_SCENARIO_IP} are still locked/blocked from a previous run (no reset in between) - re-verifying existing enforcement rather than generating a redundant attack.`
        : locked
          ? `${attemptsSent} real HTTP POST /auth/login request(s) sent from ${GATEWAY_SCENARIO_IP} through the full Fastify request lifecycle (rate limiting, audit hooks); account "${GATEWAY_SCENARIO_USERNAME}" is now locked.`
          : rateLimited
            ? `Stopped after ${attemptsSent} request(s): the gateway's own auth rate limiter rejected further attempts (HTTP 429) before lockout was reached. That is real enforcement working correctly, but this scenario run could not proceed - rerun after the rate-limit window clears.`
            : 'Lockout was not achieved within the expected attempt count.',
    });

    if (!locked) {
      logger.error({ scenario: 'gw-credential-attack', attemptsSent, rateLimited }, 'Scenario failed to trigger account lockout');
      return this.buildGatewayResult(steps);
    }

    // 2-3. Normalize + Detect: already happened as a side effect of the real requests
    // above (auth.controller.ts calls into the canonical pipeline on every failed
    // attempt) - look up the result instead of re-running detection here, which would
    // create a redundant second detection for the same attack.
    const investigations = await this.deps.investigationService.listInvestigations({ limit: 200 });
    const investigation = investigations.find((inv) =>
      inv.affectedPrincipals.some((p) => p.id === GATEWAY_SCENARIO_USERNAME) &&
      inv.sourceIps.includes(GATEWAY_SCENARIO_IP)
    );
    const events = investigation
      ? await this.deps.securityEventStore.getEventsByIds(investigation.eventIds)
      : [];
    const latestEvent = events[events.length - 1];
    const detections = investigation
      ? await this.deps.detectionStore.getByIds(investigation.detectionIds)
      : [];
    const latestDetection = detections[detections.length - 1];

    steps.push({
      id: 'normalize',
      label: 'Normalize',
      status: latestEvent ? 'completed' : 'failed',
      summary: latestEvent
        ? `The failed-login attempt was normalized into canonical event ${latestEvent.id} (schema v${latestEvent.schemaVersion}) by the real authentication controller path.`
        : 'No canonical event was found for this account/IP - see server logs.',
    });
    steps.push({
      id: 'detect',
      label: 'Detect',
      status: latestDetection ? 'completed' : 'skipped',
      summary: latestDetection
        ? `GW-AUTH-001 matched (severity: ${latestDetection.severity}).`
        : 'No detection matched (may already be correlated into a prior run).',
    });

    // 4. Correlate.
    steps.push({
      id: 'correlate',
      label: 'Correlate',
      status: investigation ? 'completed' : 'skipped',
      summary: investigation
        ? `Investigation ${investigation.id}: ${investigation.correlationExplanation}`
        : 'No investigation produced (no new detection this run).',
    });

    // 5. Respond: real, enforced IP block - the scenario's own explicit response
    // action (what a SOC analyst/automated playbook does after reviewing the
    // investigation), attached as evidence to that investigation.
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

    // 6. Verify: a genuine follow-up HTTP request from the now-blocked IP - not a
    // Redis membership check - confirming the gateway's IP-block middleware actually
    // rejects it with 403/IP_BLOCKED and a request id, and that the rejection produced
    // a real audit entry.
    const verifyRes = await this.deps.app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { username: GATEWAY_SCENARIO_USERNAME, password: 'irrelevant-blocked-before-auth-runs' },
      headers: { 'x-forwarded-for': GATEWAY_SCENARIO_IP },
    });
    const verifyBody =
      verifyRes.statusCode === 403 ? (verifyRes.json() as { error?: { code?: string }; requestId?: string }) : null;
    const genuinelyBlocked = verifyRes.statusCode === 403 && verifyBody?.error?.code === 'IP_BLOCKED' && Boolean(verifyBody?.requestId);

    let auditConfirmed = false;
    if (genuinelyBlocked) {
      const auditLogs = await this.deps.auditService.query({ eventType: 'SECURITY_IP_BLOCKED_REQUEST', limit: 50 });
      auditConfirmed = auditLogs.some((entry) => entry.ip === GATEWAY_SCENARIO_IP);
    }

    steps.push({
      id: 'verify',
      label: 'Verify evidence',
      status: genuinelyBlocked && auditConfirmed ? 'completed' : 'failed',
      summary: genuinelyBlocked
        ? `Verified via a real HTTP request: a follow-up request from ${GATEWAY_SCENARIO_IP} was rejected with 403 (code IP_BLOCKED, request id ${verifyBody!.requestId})${auditConfirmed ? ', and a matching audit entry was recorded' : ' - but no matching audit entry was found'}.`
        : `Verification failed: a follow-up request from ${GATEWAY_SCENARIO_IP} returned status ${verifyRes.statusCode}, not the expected 403/IP_BLOCKED.`,
    });

    return this.buildGatewayResult(steps, latestEvent, detections, investigation ? [investigation] : []);
  }

  private buildGatewayResult(
    steps: ScenarioStep[],
    event?: NormalizedSecurityEvent,
    detections: DetectionResult[] = [],
    investigations: SecurityInvestigation[] = []
  ) {
    return Promise.resolve({
      steps,
      eventIds: event ? [event.id] : [],
      detectionIds: detections.map((d) => d.id),
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
