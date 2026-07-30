# Demo Walkthrough

A suggested tour for reviewing this project in the dashboard, in the order the nav
presents it (`dashboard/src/components/Layout.tsx`). Each stop says what's genuinely
live versus replayed versus static, and where to verify that claim in the code -
consistent with the [data provenance model](https://github.com/jasonachkar/secure-api-gateway/blob/main/README.md#data-provenance-live-replay-and-synthetic)
described in the README.

## Getting in

From the login page, click **"Enter read-only demo"** - no credentials needed. This
calls `POST /auth/demo-login` and signs you in as a `reviewer` role: you can view
everything and run every guided scenario, but cannot block arbitrary IPs, revoke
sessions, or change configuration (those return `403`; see the "reviewer" tests in
`test/scenarios.integration.test.ts`). If you want to see the admin-only paths too,
sign in instead with `admin` / `Admin123!` (seeded for local/demo use only - never
present in the Azure deployment).

## 1. Overview (`/`)

Live request/error rates, auth stats, and rate-limit violations, streamed over SSE from
the running gateway - not canned numbers. The info banner links to Implementation
Status (below) if you want the honest capability-by-capability breakdown before going
further.

## 2. Guided Scenarios (`/guided-scenarios`)

Three reviewer-runnable, end-to-end demonstrations:

- **`aws-privileged-activity`** and **`gcp-credential-persistence`** replay a sanitized,
  real-shaped fixture through the exact same parse → normalize → detect → correlate
  pipeline live traffic uses (`provenance: 'replay'`).
- **`gw-credential-attack`** is `provenance: 'live'`: it drives real HTTP requests
  (`app.inject()` through the actual Fastify request lifecycle - real rate limiting,
  real IP-block middleware, real audit hooks) against a dedicated demo account/IP, not
  a direct service-layer call. The Verify step sends a genuine follow-up request and
  checks for a real `403 IP_BLOCKED` plus a matching audit-log entry - not a Redis
  membership check. Re-running it without resetting is safe: an already-blocked
  response is recognized as evidence enforcement persisted, not treated as a failure.
  See `src/modules/scenarios/scenario.service.ts`.

Each run produces a real detection + investigation you can open directly from the
result (deep-links to Investigations below).

## 3. Investigations (`/investigations`)

Master-detail view over `SecurityInvestigation` records: search plus
severity/status/provenance filters on the left, full detail on the right (no modal -
list and detail stay visible together). Detections are correlated into investigations
by principal, resource, source IP, account, and a fixed time window - deterministic
grouping, not an opaque risk score. Each investigation shows its timeline, the rule
matches that produced it, the raw normalized events, any response actions taken, and a
downloadable evidence package (`GET /admin/security/investigations/:id/evidence-export`).

## 4. Cloud Coverage (`/cloud-coverage`)

Per-provider (AWS/GCP/Azure/gateway) health: `healthy`/`degraded`/`unavailable`/
`replay_only`/`not_configured`, events ingested, last successful poll, consecutive
failures - backed by `GET /admin/security/pipeline-metrics`, not a static "configured"
badge. Azure shows `replay_only` honestly: no live Sentinel/Monitor connector exists.

## 5. Architecture & Evidence (`/about`)

What the dashboard's pages actually show and why the traffic you're seeing is real,
not a canned screenshot.

## More menu

- **Control Evidence** (`/compliance`) - NIST/OWASP/PCI/GDPR tabs. Each framework now
  carries an explicit banner: **"Partially live-assessed"** (NIST - one control reacts
  to real account-lockout telemetry, the rest are fixed) or **"Static
  self-assessment"** (OWASP/PCI/GDPR - a code-reviewed mapping, not a live scan or
  audit). Read the banner before reading the score.
- **Threats** - per-IP threat scoring and attack-pattern detection.
- **Audit Logs** - the tamper-evident, hash-chained audit trail; verify it hasn't been
  edited via `GET /admin/audit-logs/verify`.
- **Sessions** / **Identity & Access** - active JWT sessions and RBAC configuration.
- **Implementation Status** (`/implementation-status`) - the capability registry
  (`src/modules/security/capability-registry.ts`), grouped by category, with a status
  badge (`implemented`/`partial`/`simulated`/`planned`) and implementation/test-path
  links per capability. This is the single source of truth the rest of the UI and docs
  are written to match, not a separate marketing summary - if something here disagrees
  with a claim elsewhere, trust this page and file it as a bug.
- **API Documentation** - the full OpenAPI spec, served live at `/docs`.

## What's intentionally not here

The dashboard used to have an `/incidents` page. It was removed - see
[`KNOWN_LIMITATIONS.md`](KNOWN_LIMITATIONS.md#legacy-ingestion-path-unused-not-yet-removed)
for why (its playbook actions were mocked but rendered identically to real response
actions). Investigations is the current case-management surface.
