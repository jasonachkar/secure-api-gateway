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

## Cloud ingestion

See `docs/CLOUD_INGESTION.md` and the in-app Cloud Coverage page for the current
live/replay status of each provider. In short: AWS and GCP replay fixtures exercise the
real parse -> normalize -> detect -> correlate pipeline; live polling adapters exist for
both but their current wiring status (and any gap between "adapter exists" and "adapter
feeds the canonical pipeline") is tracked in the capability registry
(`src/modules/security/capability-registry.ts`), which is the single source of truth for
what is actually live versus replay-only versus planned. Azure is replay-only - no live
Sentinel/Monitor connector is implemented.
