# Changelog

Notable changes on `features/senior-cloud-security-control-plane` (PR #14), the branch
that transformed this project from a single-service API gateway into a multi-cloud
security detection and investigation control plane. Entries are phases, not individual
commits - each phase landed as one or more reviewable commits, was validated (tests,
build, CI), and pushed before the next started. See `git log` for exact commits.

## Phase 12 — Final quality/claim audit

A closing sweep across the whole branch (emoji, fabricated/random data, TODO/FIXME
markers, console.log leftovers, broken doc links, static-credential defaults) found
one genuine remaining gap: `GET /admin/compliance/posture` (the "Security Posture"
grade - the default Compliance tab, and a prominent Dashboard homepage widget) had the
exact problem Phase 7 fixed for the NIST/OWASP/PCI/GDPR tabs, just missed because it's
a separate endpoint. `auditLogging`'s score was a hardcoded constant weighted 15% into
the total, and several factor detail fields were pure fabrication with no live signal
at all - one of them (`retentionDays: 90`) was actively wrong, not just unmeasured
(the real audit-log Redis TTL is 30 days). Fixed by deleting the fabricated fields
outright and adding an honest `assessmentNote` disclosure, consistent with the Phase 7
pattern - see `docs/KNOWN_LIMITATIONS.md`.

Everything else audited clean: zero emoji in `dashboard/src` (CI-enforced), no
undisclosed `Math.random()` usage, no console.log debug leftovers, no broken internal
doc links, static AWS/GCP credentials remain opt-in and disclosed. 258/258 backend
tests passing, both builds clean.

## Phase 11 — CI/CD completion

Phase 10 built a real accessibility + interaction e2e suite, but it only ran manually
against a local stack - not part of any GitHub Actions workflow, so regressions could
land uncaught. Added `.github/workflows/e2e.yml`: boots the real backend and a
production dashboard build (`vite preview`, not the dev server - testing what actually
ships) against a real Redis service container, waits for both via health-check polling
rather than a fixed sleep, then runs the full Phase 10 suite. Uploads the Playwright
report and both servers' logs as artifacts on failure. Verified passing (2m11s, all 18
tests including one that had been intermittently flaky on a local Windows dev machine)
on its first real run - confirming that flake was local environment noise, not an
application defect.

## Phase 10 — Testing strategy

- Added `test/compliance-service.unit.test.ts` (against a real Redis connection,
  matching this project's established pattern) verifying Phase 7's `assessmentBasis`
  honesty distinction actually holds under test, not just by inspection. Found and
  removed an unused `adminService` constructor dependency on `ComplianceService` while
  writing it.
- Expanded the dashboard's single smoke test into a real accessibility suite
  (`@axe-core/playwright`) across every nav page, plus genuine interaction tests for
  Investigations' filters and Compliance's assessmentBasis banners. Running it against
  a live local stack (not writing it blind) surfaced and fixed four real bugs: two
  WCAG 2 AA color-contrast failures (Logout button, login page hint text), a keyboard-
  accessibility bug in `Drawer.tsx` (a "closed" drawer's close button was still
  reachable by Tab), and an unfocusable scrollable region in `TokenLifecycleDiagram`.
  Also found a real nav/permission mismatch - the "Control Evidence" nav item is shown
  to every authenticated user but its backing endpoint is admin-only - documented
  rather than silently changing backend permissions as a test-writing side effect.
- Discovered and fixed a test-design bug of its own: the first draft of the e2e suite
  called the real demo-login endpoint once per test and blew through
  `RATE_LIMIT_AUTH_MAX` by the fourth test. Fixed with a `global-setup.ts` that logs in
  once and reuses the session via Playwright's `storageState`.

## Phase 9 — Documentation overhaul

- README.md described the pre-transformation, single-service gateway story - zero
  mentions of detection, investigations, guided scenarios, or cloud coverage anywhere
  in it, despite Phases 1-8 making those the actual core of the product. Rewrote it:
  a "Data provenance" section (live/replay/synthetic), a rebuilt features section
  describing the real architecture, and an explicit disclosure of what was removed
  (the Incidents page) and why, rather than presenting the legacy incident system as a
  current highlight the way the old README did.
- `docs/ARCHITECTURE.md`'s ingestion component breakdown still described the legacy
  pre-Phase-2 architecture (a separate pipeline feeding
  `IncidentResponseService.createIncidentFromNormalizedEvent()`). Rewritten to
  describe the current unified `ingestProviderEvent()` pipeline and the
  detection/investigations/security/scenarios/response modules that didn't exist in
  this doc before. Also fixed a broken anchor link.
- Added `docs/DEMO_WALKTHROUGH.md` and this changelog - neither existed before,
  leaving `git log` as the only record of how significantly this branch changed the
  project.

## Phase 8 — Cloud identity & infrastructure quality

- `terraform.yml`'s tfsec step was report-only (SARIF upload, never failed the build
  regardless of severity). Added a second, blocking tfsec run that fails CI on
  HIGH/CRITICAL findings - confirmed clean against the current `terraform/` tree,
  including the AWS IAM-user-with-attached-policy pattern that had no prior
  suppression comment.
- Documented the AWS/GCP live-ingestion credential model end to end: `.env.example`
  now lists the relevant env vars (previously undiscoverable without reading adapter
  source), and `docs/CLOUD_INGESTION.md` gained a portable "Minimal IAM policy"
  section (exact least-privilege AWS JSON policy + GCP `gcloud` commands) for anyone
  pointing the live adapters at an existing account without running this repo's
  Terraform.

## Phase 7 — Synthetic-data-confusion audit

- Compliance page (`/compliance`) presented NIST/OWASP/PCI/GDPR scores identically,
  but only one NIST control reacts to live telemetry - OWASP/PCI/GDPR and 3 of 4 NIST
  controls were fixed self-assessment constants (GDPR always returned 100). Added an
  explicit `assessmentBasis` (`partially-live`/`static`) and `assessmentNote` per
  framework, rendered as a banner on every tab.
- `POST /admin/incidents/:id/playbook` wrote a fabricated ticket ID and
  `status: 'completed'` with no `mocked` flag, inconsistent with its sibling
  `/actions` endpoint. Both now consistently mark output `result: 'mocked'`, and the
  Swagger description for `/playbook` now says so too.

## Phase 6 — Reviewer UI redesign

- Removed the dashboard's `/incidents` page: it read from a system disconnected from
  the real detection pipeline, and its "playbook actions" wrote a hardcoded
  `result: 'mocked'` into the timeline while rendering identically to genuine response
  actions - discovered during this phase, not merely "legacy and redundant."
- Rebuilt Investigations from a table-plus-modal-drawer into a genuine master-detail
  layout: search plus severity/status/provenance filters, list and detail visible
  together, no overlay.

## Phase 5 — Guided scenarios, genuinely end-to-end

- The gateway credential-attack scenario called `AuthService.login()` directly and
  verified enforcement via Redis set membership. Rewritten to drive real `app.inject()`
  HTTP requests through the actual Fastify lifecycle (rate limiting, IP-block
  middleware, audit hooks), with a genuine follow-up request + audit-log check for
  verification instead of a membership check.
- Found and fixed: an `attemptsSent` undercount from a `break` skipping a `for` loop's
  increment; a rerun-without-reset gap (an already-blocked response wasn't recognized
  as evidence enforcement persisted, and would have been reported as a failure).
- Added `aws-parser.unit.test.ts`, `gcp-parser.unit.test.ts`, `azure-parser.unit.test.ts`
  - every parsed event claimed an `evidence: [{type: 'test', reference: ...}]` pointing
  at these files before they existed.

## Phase 4 — Real signal wiring

- `GW-AUTH-001` (gateway credential-attack detection, concentrated + distributed) and
  `GW-TOKEN-001` (JWT failure detection, 6 signal types, deliberately excluding routine
  token expiry) went from unwired rule definitions to genuinely evaluated against
  live gateway auth activity.
- Fixed a fire-and-forget race (`void evaluateTokenFailure(...)` racing the HTTP
  response), a routing bug where the `/admin/*` privileged-route escalation prefix
  also (incorrectly) caught routine `jwt.expired` failures, and a rule that computed
  an escalated severity but never applied it (`severity: this.severity` ignored the
  computed value).
- Added `RuleHealthTracker` (per-rule evaluation/match/error counts) and end-to-end
  detection-latency metrics.

## Phase 3 — Concurrency-safe persistence

- Event dedup and investigation correlation made atomic under real concurrent load.
  Uses short-TTL, token-checked Redis locks (`SET token PX ttl NX` + a Lua-scripted
  token-checked release) rather than `WATCH`/`MULTI`/`EXEC`, because this app shares
  one Redis connection across all concurrent request handlers and `WATCH` state is
  per-connection, not per-caller - see `docs/CONCURRENCY.md`.
- Fixed a thundering-herd retry pattern (15 concurrent detections sharing a
  correlation key started failing after 8 lockstep-interval retries) with jittered
  backoff and a higher retry ceiling.

## Phase 2 — Unified ingestion architecture

- Live AWS/GCP polling previously fed a separate legacy pipeline
  (`NormalizedEvent`/`IncidentResponseService.createIncidentFromNormalizedEvent()`)
  that never touched detection rules, investigations, or evidence. Unified onto one
  canonical `ingestProviderEvent()` function used by live adapters, replay, and guided
  scenarios alike.
- Fixed a live-only bug the replay-fixture-based tests couldn't catch: the GCP client
  library returns `timestamp` as a JS `Date`, but the shared parser (built against
  string-only replay fixtures) only accepted a string - every live GCP event would
  have silently failed to parse.

## Phase 1 — Hard security/merge blockers

- Resolved the blockers gating PR #14 before feature work could proceed: dependency
  vulnerabilities (`@fastify/static`, `brace-expansion`), Key Vault Terraform findings,
  CORS credential reflection, rate-limit gaps, unredacted parser failures, an
  unrestricted `trustProxy: true`, and a path-traversal weakness in the fixture loader.

## Earlier — `4fe758a` and prior

- `4fe758a` ("Transform into a multi-cloud API security control plane") established
  the initial control-plane direction this branch's phases then built out.
- Several `CodeQL`-flagged findings (rate limiting, path/URL sanitization) were fixed
  ahead of the phased work above.
