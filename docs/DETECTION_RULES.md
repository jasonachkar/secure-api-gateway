# Detection Rules

Every rule lives in `src/modules/detection/rules/` and implements the shared
`DetectionRule` interface (`src/modules/detection/types.ts`): a stable id, semantic
version, severity + rationale, matched-field contract, false-positive notes,
remediation steps, which providers it applies to, which provenance it has a *real,
verified* signal producer for, and which tests exercise it. `DetectionEngine.evaluate()`
(`src/modules/detection/engine.ts`) runs the full ruleset against every canonical event
- live or replayed - through the single ingestion pipeline
(`src/modules/ingestion/security-ingestion.pipeline.ts`, see `docs/CLOUD_INGESTION.md`).

A rule throwing during evaluation is isolated: the engine catches it, records the error
against that rule's health, and keeps evaluating the rest of the ruleset for that event -
one broken rule can't take down detection for everything else, or crash the calling
pipeline stage.

## Rule health

`GET /admin/security/rules` (`DetectionEngine.getRuleHealth()`) returns, per rule:

- Static: `enabled`, `version`, `severity`, `providers`, `supportedProvenance`, `testPaths`.
- Runtime (`src/modules/detection/rule-health.ts`, Redis-backed): `evaluationCount`,
  `matchCount`, `errorCount`, `lastEvaluatedAt`, `lastMatchedAt`, `lastErrorAt`,
  `lastErrorMessage`.

`evaluationCount` only increments when a rule's `providers` list actually includes the
event's provider - a gateway-only rule seeing an AWS event was never truly run, so it
isn't counted as an evaluation with a null result.

## GW-AUTH-001 - Gateway credential attack

Detects **concentrated** (many failed attempts, one source) and **distributed** (many
failed attempts, many source IPs) credential-attack patterns against one account.

**Real signal, not a fixed post-lockout snapshot.** Every failed login -
`AuthController.login()`'s catch block, not just the branch that produces
`AccountLockedError` - calls `GatewayAuthTracker.recordFailure(username, ip)`
(`src/modules/security/gateway-auth-tracker.ts`), which maintains a per-username failure
count and a per-username distinct-source-IP set (`SADD`) in a configurable sliding
window (`GW_AUTH_DETECTION_WINDOW_MS`, default 15 minutes - independent of
`LOCKOUT_DURATION`, which gates access, not detection). The rule evaluates against those
*real, currently measured* numbers on every attempt:

- `concentrated = failedLoginCount >= 5`
- `distributed = distinctSourceIps >= 3 && failedLoginCount >= 3`

This is why a distributed attack (many IPs, one attempt each against a shared account)
is detectable even though no single IP ever reaches the per-`(username, IP)` lockout
threshold (`LockoutManager`, `auth.service.ts` - a deliberately separate concern: lockout
decides whether *this* IP can keep trying, not whether an attack pattern exists across
IPs). Verified in `test/gw-auth-detection.integration.test.ts`: 3 distinct IPs each
attempting once trigger distributed detection with no IP ever locked out; 5 attempts from
one IP (with lockout deliberately raised above 5 for that test) trigger concentrated
detection before lockout engages.

The guided AWS gateway-credential-attack scenario (`scenario.service.ts`) calls the
underlying `evaluateGatewayCredentialAttack()` directly with a fixed, scripted attempt
count rather than the tracker - it's a deterministic demo of the same detect/correlate/
respond path, not meant to exercise the tracker's real-measurement behavior (that's what
the dedicated integration tests above do).

## GW-TOKEN-001 - Tampered or invalid JWT attempt

`middleware/auth.ts#requireAuth` - the preHandler on every protected route - generates a
canonical gateway event for every JWT verification failure, via `evaluateTokenFailure()`
(awaited, not fire-and-forget, so the detection write reliably lands before the 401
response is sent):

| Failure | Action | Matches the rule? |
| --- | --- | --- |
| Invalid signature | `jwt.tampered` | Yes |
| Malformed / other invalid | `jwt.invalid` | Yes |
| Expired | `jwt.expired` | **No** - deliberately excluded (see below) |
| Wrong token type (e.g. refresh used as access) | `token.invalid_type` | Yes |
| Revoked access token reuse | `token.revoked` | Yes |
| Any of the above on an `/admin/*` route | prefixed `privileged_jwt_failure:...` | Yes, at `critical` severity |

**Expired tokens are excluded from matching on purpose.** Access tokens are short-lived
by design; every normal client refresh cycle produces an expired-token 401 at some point.
Alerting on that would open an investigation on routine, expected behavior. The canonical
event is still generated (pipeline evidence, visible in Cloud Coverage / raw event
listings) - it simply never reaches a `DetectionResult`. This exclusion holds even on
`/admin/*` routes: the privileged-route escalation is applied to every other failure type
but never to plain expiry, otherwise it would silently defeat the exclusion for admin
users whose sessions expire mid-work.

Never records the raw token - only route, method, error classification, and (for revoked
tokens) the `jti`, a random identifier, not the token itself.

Verified in `test/gw-token-detection.integration.test.ts`: one test per signal type
against a real running app (tampered signature via bit-flipping a real token's signature
segment, a non-JWT string, a refresh token presented as an access token, logout followed
by reuse of the same access token, and an explicitly-expired token confirmed to generate
evidence but never match).

## AWS-IAM-001 / AWS-IAM-002, GCP-IAM-001, AZ-IAM-001

Provider-specific rules matching on CloudTrail/Cloud Audit Log/Azure Activity Log
field shapes (root-account activity, IAM policy/access-key changes, service-account key
creation, privileged role assignment) - see each rule file's `evaluate()` for the exact
matched fields. AWS and GCP rules support both `replay` and `live` provenance (see
`docs/CLOUD_INGESTION.md` for the live adapter wiring); Azure remains `replay`-only since
no live connector exists.

## Detection latency

`security-ingestion.pipeline.ts` times each stage of one event's trip through the
pipeline (parse, persist/dedupe, detect, correlate) and reports real, measured averages
via `PipelineMetrics.getSnapshot()` (`averageIngestionDelayMs`,
`averageDetectionDurationMs`, `averageCorrelationDurationMs`,
`averageEndToEndDurationMs`) - not fabricated historical SLO percentages. A duplicate
event short-circuits before detection/correlation run, so those two durations are `0`
for that call (verified in `test/pipeline-metrics-latency.unit.test.ts`) rather than
padded with a stage that never executed.
