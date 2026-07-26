# Incident Response

Playbooks for the scenarios called out in [`THREAT_MODEL.md`](THREAT_MODEL.md). Each
follows: **Detect → Contain → Eradicate → Recover → Learn**.

For the in-app incident workflow (tracking, assignment, timeline, playbook actions)
see `GET/POST /admin/incidents/*` (`src/modules/admin/incident-response.service.ts`) -
the steps below are what an operator actually *does*; the in-app workflow is for
tracking that work. This API is no longer surfaced in the reviewer dashboard (see
[`KNOWN_LIMITATIONS.md`](KNOWN_LIMITATIONS.md#legacy-ingestion-path-unused-not-yet-removed)) -
its `status`/`assign`/`notes` endpoints are real, but its playbook-action endpoints
(`POST .../actions`, `POST .../playbook`) are mocked (`result: 'mocked'`, no real
user/IP/ticketing integration) and must not be treated as the "Contain"/"Eradicate"
steps below actually happening. Real containment (IP blocking, session revocation) is
`src/modules/response/response.service.ts`, called from Investigations and the guided
scenarios, not from this incident workflow.

## Secret leaked (JWT secret, cookie secret, Redis password, third-party API key)

**Detect**: found in a commit, a log line, a screenshot, a third-party breach
notification, etc.

**Contain**:
1. Rotate the secret immediately - don't wait to understand blast radius first.
   - `JWT_SECRET`/`COOKIE_SECRET`: `terraform taint random_password.jwt_secret` (or
     `.cookie_secret`) + `terraform apply` generates and stores a new value in Key
     Vault. Restart the Container App to pick it up:
     `az containerapp revision restart -n <app> -g <rg>`.
   - `REDIS_PASSWORD`: `az redis regenerate-keys -n <redis-name> -g <rg> --key-type Primary`,
     then update the Key Vault secret and restart.
   - Third-party key (e.g. AbuseIPDB): rotate on the provider's side, then
     `az keyvault secret set` with the new value.
2. If the leak was via a git commit: rotating the secret is the actual fix (the old
   value in git history is permanently compromised regardless of history rewriting -
   don't rely on `git filter-repo`/BFG as the primary mitigation, treat it as
   optional cleanup after rotation).

**Eradicate**: confirm the old secret no longer validates (attempt to use it - it
should fail). For `JWT_SECRET` specifically: rotating it immediately invalidates every
existing access and refresh token (expected and correct - see "Token compromise"
below for the user-facing consequence).

**Recover**: verify `/healthz` and `/readyz`, confirm login works with the new
secrets end-to-end, monitor error rates for the following hour.

**Learn**: how did the secret reach a place it shouldn't have (log line, commit,
screenshot)? Fix that specific exposure path - e.g. if it was logged, check
`src/lib/logger.ts`'s `REDACT_PATHS` covers the field that leaked and add it if not.

## Token compromise (stolen access/refresh token, or suspected session hijack)

**Detect**: user report, anomalous activity in audit logs for a given `userId`/`jti`,
or a refresh-token-reuse event (`TOKEN_REVOKED` audit entries with "reuse detected" -
this fires automatically, no manual detection needed for this specific case).

**Contain**:
1. **Reuse already auto-contained**: if this was flagged by reuse detection, the
   entire token family (every access + refresh token from that login's rotation
   chain) is already revoked - `src/modules/auth/auth.service.ts`'s `refresh()`.
2. **Manual revocation** (e.g. a user reports a stolen device): find the user's active
   refresh token jti(s) and blacklist them directly:
   ```bash
   redis-cli ... SETEX "token:blacklist:<jti>" 604800 "1"
   ```
   For access tokens, same pattern with the access token's jti - it'll be rejected by
   `requireAuth`'s revocation check immediately (not just on next expiry).
3. Force full re-authentication: instruct the user to log in again on all devices.

**Eradicate**: if the compromise vector is unclear (not an obvious lost-device case),
treat it as a possible broader breach - check `/admin/audit-logs?userId=<id>` for the
full activity history on that account, looking for actions the legitimate user didn't
take.

**Recover**: confirm the user can log in normally with fresh credentials; monitor their
account's audit trail for a period after.

**Learn**: was this an isolated incident or does it indicate a pattern (e.g. phishing
campaign, XSS vector for token theft)? Update `THREAT_MODEL.md` if a new vector was
identified.

## Abuse spike (credential stuffing, brute force, scraping, rate-limit evasion)

**Detect**: `/admin/threats` shows elevated threat scores; `/admin/metrics/summary`
shows a spike in `RATE_LIMIT_EXCEEDED` or `LOGIN_FAILURE` events; AbuseIPDB
integration flags a source IP.

**Contain**:
1. Identify the source: `GET /admin/audit-logs?eventType=RATE_LIMIT_EXCEEDED` or
   `LOGIN_FAILURE`, grouped by IP.
2. Block at the edge if it's concentrated on a small IP set: if APIM is enabled
   (`enable_apim`), add an IP-restriction policy; otherwise, Azure Container Apps
   doesn't have built-in IP allow/block lists - use Azure Front Door or an NSG on the
   VNet-integrated path (`enable_vnet`) for edge-level blocking, or tighten
   `RATE_LIMIT_GLOBAL_MAX`/`RATE_LIMIT_AUTH_MAX` temporarily via a Container App env
   var update if the attack is distributed across many IPs.
3. `POST /admin/threats/:ip/block` (threat-intel module) for a quick in-app block if
   the pattern is concentrated on specific IPs already being tracked.

**Eradicate**: once the rate limit / block is confirmed effective (watch the metrics
stream), no further action needed unless accounts were actually compromised (see
"Token compromise" above) - brute force that didn't succeed doesn't require
credential rotation for the targeted accounts.

**Recover**: revert any temporary rate-limit tightening once the spike subsides;
document the source IPs/patterns for future threat-intel reference.

**Learn**: did the attack reveal a gap (e.g. a username enumeration vector, a rate
limit that was too permissive)? File it against `THREAT_MODEL.md`.

## Upstream under attack / degraded

**Detect**: `GET /admin/upstream-health` shows a circuit breaker in `open` state for a
given host; elevated 503s from proxy/report endpoints; upstream's own status page.

**Contain**: the circuit breaker has already contained this automatically - once open,
the gateway fails fast instead of piling retries onto a struggling upstream. No manual
action is required for the gateway's own health.

**Eradicate**: this is the upstream's incident, not the gateway's - coordinate with
whoever owns it. From the gateway side, confirm `ALLOWED_UPSTREAM_HOSTS` doesn't need
adjusting if the upstream's infrastructure changed (new IPs, new hostname).

**Recover**: the circuit breaker automatically transitions to half-open after
`CIRCUIT_BREAKER_COOLDOWN_MS` and closes again once a trial request succeeds - no
manual reset needed. To force a reset sooner (e.g. you know the upstream is back),
restart the gateway (`az containerapp revision restart`) to clear in-process breaker
state.

**Learn**: was `CIRCUIT_BREAKER_FAILURE_THRESHOLD`/`COOLDOWN_MS` well-tuned for this
upstream's actual failure characteristics? Adjust if the breaker tripped too
eagerly/too late.

## Audit log tampering detected

**Detect**: `GET /admin/audit-logs/verify` reports `valid: false`.

**Contain**: treat this as a likely broader compromise, not an isolated logging bug -
if an attacker had write access to Redis (or the log file) to tamper with the audit
log, they likely had access to everything else Redis holds too (tokens, API keys,
rate-limit state). Rotate `REDIS_PASSWORD` immediately (see "Secret leaked" above) and
treat all active tokens/API keys as potentially compromised.

**Eradicate**: identify how Redis (or the log file, in a non-Azure deployment) was
reached directly - it should never be reachable from outside the Container Apps
environment. Check network configuration (was `enable_vnet` supposed to be on?
firewall rules?) and Azure activity logs for who/what accessed it.

**Recover**: after rotating credentials and confirming the access path is closed,
resume normal operation. The broken chain segment marks exactly where tampering
started (`brokenEntryId` in the verify response) - preserve that for the retrospective.

**Learn**: this is a genuine gap worth being honest about - the hash chain is
tamper-*evident*, not tamper-*proof* (see `SECURITY_CONTROLS.md#roadmap`). If this
scenario is a real concern for your deployment, prioritize the external-anchoring
roadmap item before treating the audit log as forensically reliable.

## Data breach (broader compromise, unclear scope)

1. Activate this runbook's relevant sections in parallel (secret rotation, token
   revocation) rather than sequentially - contain fast, understand scope after.
2. Isolate: restrict access to Azure resources to the minimum set of people
   investigating (Azure RBAC on the resource group).
3. Review `/admin/audit-logs` for the full timeline, cross-referenced with Azure
   Activity Log for the resource group.
4. Notify affected users per your actual legal/compliance obligations - this repo
   doesn't implement a notification system, and this doc isn't legal advice.
5. Document the timeline and impact; conduct a retrospective once resolved.
