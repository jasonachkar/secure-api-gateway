# Known Limitations

This project is a security engineering demonstration and reference architecture, not a
commercial SIEM, CNAPP, or certified compliance product. This document lists what is
genuinely incomplete, external-dependency-gated, or intentionally simplified, and records
the reasoning behind every CodeQL/Trivy finding that was reviewed and dismissed rather
than fixed - dismissals are documented here, not silently ignored.

## Dismissed static-analysis findings

Each entry below was individually reviewed against the actual code path before being
judged a false positive. None were dismissed on the strength of the rule name alone.

### CodeQL `js/insufficient-password-hash` - `src/modules/apikeys/apikey.store.ts`

Flags `createHash('sha256').update(rawKey)` as an insufficiently slow password hash.
This is not a password hash: `rawKey` is `gwk_<16-hex-id>_<64-hex-secret>`, where the
secret half is 32 bytes (256 bits) of `crypto.randomBytes` output - not a user-chosen,
low-entropy string. Slow hashing algorithms (bcrypt/scrypt/Argon2) exist to defend
against brute-forcing a human-guessable password space; a 256-bit random secret is
already computationally infeasible to brute force regardless of hash speed, and a fast
hash is required here because every API request does a lookup against it. This is the
same pattern GitHub, Stripe, and AWS use for API/personal-access tokens.

### CodeQL `js/clear-text-logging` - `src/modules/apikeys/apikey.middleware.ts:103`

Flags a `logger.warn` call carrying `apiKeyId` and `apiKeyScopes`. Neither the raw key
nor its hash is ever logged here (see `apikey.store.ts` above) - only the key's public
identifier and its scope list, which are safe to log for operational debugging.

### CodeQL `js/clear-text-logging` - `scripts/generate-secrets.js:23`

Flags `console.log` calls printing freshly generated secrets. This is a one-shot,
locally-run operator CLI tool whose entire purpose is displaying newly generated secrets
so they can be copied into a deployment platform's environment variables - it is not an
application log sink, and nothing here writes to a persistent or aggregated log.

### CodeQL `js/missing-rate-limiting` - `src/app.ts` (`GET /healthz`)

The health-check endpoint does no filesystem, database, or otherwise expensive work - it
returns `process.uptime()` and a status string. Rate-limiting it would risk load
balancers and uptime monitors (which poll frequently by design) seeing false-negative
health checks under normal operation, which is a worse outcome than the theoretical DoS
risk of an unthrottled endpoint that does no real work.

### Trivy secret scan `gcp-service-account` - `test/fixtures/gcp/service-account-key-created.json`

Trivy's secret scanner matches this file because it contains a
`*.iam.gserviceaccount.com` principal string inside a synthetic Cloud Audit Log payload.
The file contains no `private_key` field or any other credential material - every value
(`demo-project-123`, `admin@example.com`, source IP `192.0.2.80` from the RFC 5737
documentation range) is fabricated replay data for the GCP guided scenario. Verified by
hand; excluded from the Docker workflow's Trivy scan via `skip-files` (see
`.github/workflows/docker.yml`), not via a blanket ignore.

## Accepted-risk Terraform findings (not false positives - deliberate trade-offs)

### tfsec `azure-keyvault-specify-network-acl` - `terraform/modules/key-vault/main.tf`

The Key Vault's `network_acls.default_action` defaults to `"Allow"` because this stack
has no VNet integration wired by default (`enable_vnet` is opt-in) - a default `"Deny"`
would cut the Container App off from its own secrets. Set
`network_default_action = "Deny"` plus `allowed_subnet_ids` once VNet integration is
enabled for a real deployment. Suppressed inline with `# tfsec:ignore:...` next to the
exact reasoning.

### tfsec `azure-keyvault-no-purge` - `terraform/modules/key-vault/main.tf`

`purge_protection_enabled` defaults to `false` so a demo/dev vault can be torn down
immediately with `terraform destroy` instead of lingering in a 7-90 day soft-deleted
state that blocks reusing the same vault name. Set `purge_protection_enabled = true`
for a real production deployment. Suppressed inline with `# tfsec:ignore:...`.

## Third-party dependency vulnerabilities

Production `npm audit` currently reports remaining HIGH/MODERATE findings (0 CRITICAL)
concentrated in `@google-cloud/logging`'s transitive dependency tree (`google-gax`,
`gaxios`, `retry-request`, `uuid`) and `geoip-lite`'s `ip-address` dependency. Clearing
these requires breaking major-version bumps that need their own regression pass rather
than a blind `npm audit fix --force`; tracked here rather than silently ignored. The one
CRITICAL finding that was fixable without a breaking change (`tar`, pulled in
transitively by `bcrypt` -> `@mapbox/node-pre-gyp`) was resolved via an `overrides` entry
in `package.json` pinning `tar` to a patched release - `tar` is only used at
`npm install` time to unpack bcrypt's prebuilt native binary, never at runtime.

The Docker image additionally removes the bundled `npm`/`npx` CLI from the final
production stage after using it to install dependencies, since the runtime container
only ever execs `node dist/main.js`. This closed a CRITICAL finding in `npm`'s own
vendored `tar` copy at `/usr/local/lib/node_modules/npm/node_modules/tar`, which shipped
inside the upstream `node:20-alpine` base image and was outside this project's own
dependency tree.

## Synthetic background data

`MetricsSeederService` fabricates requests/logins/threat events on a timer purely to
produce visually interesting dashboard charts for local demos. It is disabled by default
and gated behind `ENABLE_SYNTHETIC_BACKGROUND_DATA=true` (see `.env.example`) - it never
runs in the default reviewer experience, and its output must never be read as real
telemetry or factored into any compliance/posture scoring.

## Concurrency coverage is partial

Event deduplication (`SecurityEventStore.saveEvent`) and investigation correlation
(`InvestigationService.correlate`) are atomic and race-free under concurrent writers -
see `docs/CONCURRENCY.md` for the design and `test/security-event-concurrency.integration.test.ts`
/ `test/investigation-concurrency.integration.test.ts` for verification. Two other
investigation-mutating paths are not: `attachResponseAction()` and `setStatus()` are
plain read-modify-write with no lock, so two concurrent response actions attaching to
the same investigation (or a status change racing a correlation) could lose an update.
These are lower-frequency, operator-driven paths (a human clicking "block IP" or
"resolve"), not the high-frequency ingestion/detection hot path - but they are not
concurrency-safe today. Also not covered: sorted-set index pruning is lazy/self-healing
during reads (see `docs/CONCURRENCY.md`), not a scheduled maintenance sweep of the full
index.

## Legacy ingestion path (unused, not yet removed)

Live AWS/GCP polling now feeds the canonical `NormalizedSecurityEvent` pipeline
end to end - see `docs/CLOUD_INGESTION.md`. Before that, it fed a separate legacy
pipeline (`NormalizedEvent` schema in `src/modules/ingestion/normalized-event.types.ts`,
`NormalizedEventStore`'s event-storage methods, and
`IncidentResponseService.createIncidentFromNormalizedEvent()`), which never touched
detection rules, investigations, or evidence. Nothing in the live or replay ingestion
path calls into that legacy code anymore, but it has not been deleted. Do not describe
the legacy `NormalizedEvent` path as removed - it is dead for ingestion purposes but
still present in the codebase.

The dashboard's `/incidents` page has been removed (it read from
`IncidentResponseService`, disconnected from the real detection/investigation pipeline
above, and its "playbook actions" - disable user / block IP / open ticket - wrote a
hardcoded `result: 'mocked'` into the incident timeline rather than performing any real
action, which the UI presented no differently from genuine response actions). The
reviewer-facing case-management surface is now exclusively the Investigations page,
backed by real correlated detections with real response actions
(`src/modules/response/response.service.ts`). `IncidentResponseService` and its
`/admin/incidents*` REST API are still present in the backend - they remain in active
use by `ThreatIntelService.createIncidentFromThreat()` for automatic escalation of
high/critical threat-intel scores, and are still reachable directly via the API for
administrative/scripted use - but the mocked playbook-action endpoints
(`POST /admin/incidents/:id/actions`, `POST /admin/incidents/:id/playbook`) should not
be treated as real enforcement by any caller. Both now consistently write
`result: 'mocked'` into the returned/persisted timeline entry and say "(mocked)" in
their Swagger description, so this is discoverable from the API response itself, not
just from this document - but fully removing or replacing the mocked playbook-action
surface is still unstarted follow-up work. The demo-only `POST
/admin/incidents/seed-test-data` endpoint (404s unless `DEMO_MODE=true`, off by
default) tags every incident it creates with `seed-test-data` for traceability if
`DEMO_MODE` is later toggled off in an environment where it already ran.

## Compliance scores mix live telemetry and fixed self-assessment

`GET /admin/compliance/metrics` (the Compliance page's NIST/OWASP/PCI/GDPR tabs) is
not a live compliance scan or third-party audit. Each framework's response now carries
an explicit `assessmentBasis` (`'partially-live'` or `'static'`) and `assessmentNote`
field, rendered as a banner at the top of every tab in the dashboard:
- **NIST**: partially live - `AC-2` (Account Management) reacts to real account-lockout
  telemetry; `AC-7`, `SI-4`, `SC-5` are fixed self-assessments.
- **OWASP Top 10**: fully static - a code-reviewed mapping of implemented mitigations,
  not a scan or pentest.
- **PCI DSS**: fully static - most requirements are marked not-applicable/compliant
  because the gateway does not store cardholder data; not a QSA audit.
- **GDPR**: fully static - always 100%, a design-intent mapping, not a data-processing
  audit.

Before this change, all four scores rendered identically regardless of whether they
reflected runtime behavior or a fixed claim, which is exactly the kind of "static data
presented as if computed" pattern this document exists to call out. Do not remove the
`assessmentBasis`/`assessmentNote` fields or the dashboard banner that renders them
without replacing the underlying scoring with something genuinely live.

**The same problem existed on `GET /admin/compliance/posture`** (the "Security Posture"
grade/score - the default Compliance tab, and a prominent widget on the Dashboard
homepage), missed in the original Phase 7 pass since it's a separate endpoint from the
four framework tabs above. `SecurityPosture.factors.auditLogging.score` was a hardcoded
constant (`calculateAuditScore()` always returned 90, comment: "Assume good audit
logging if service exists"), weighted 15% into the overall score, with no disclosure.
Several factor `details` sub-fields were also fabricated placeholders with no live
signal behind them at all: `authentication.sessionSecurity` (always 85),
`threatIntelligence.threatResponseTime` (always 0), `rateLimiting.coverage` (always
90), `auditLogging.logCoverage`/`retentionDays` (always 95 / 90 - the latter was
actively wrong, not just unmeasured: the real audit-log Redis TTL is 30 days, not 90).
Fixed by removing all of those fabricated fields entirely (rather than disclosing a
number nobody should trust) and adding a single `assessmentNote` on `SecurityPosture`
disclosing that `auditLogging`'s score specifically is a fixed baseline, rendered as a
banner on the Compliance page's Security Posture tab and a one-line note on the
Dashboard homepage widget. `authentication.details.mfaEnabled` was kept as `false` -
that one is not a placeholder, it is an accurate statement that MFA genuinely is not
implemented (see README Roadmap), not a guess standing in for a real measurement.

## Cloud ingestion

See `docs/CLOUD_INGESTION.md` and the in-app Cloud Coverage page for the current
live/replay status of each provider. In short: AWS and GCP replay fixtures exercise the
real parse -> normalize -> detect -> correlate pipeline; live polling adapters exist for
both but their current wiring status (and any gap between "adapter exists" and "adapter
feeds the canonical pipeline") is tracked in the capability registry
(`src/modules/security/capability-registry.ts`), which is the single source of truth for
what is actually live versus replay-only versus planned. Azure is replay-only - no live
Sentinel/Monitor connector is implemented.
