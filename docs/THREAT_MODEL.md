# Threat Model

Scope: the gateway (`src/`), its Redis-backed state, the Azure deployment
(`terraform/`), and the dashboard (`dashboard/`). Out of scope: physical security,
Azure platform internals, and the security of "upstream services" the gateway proxies
to (they're treated as an external trust boundary - see below).

## Trust boundaries

```
┌─────────────────────────────────────────────────────────────────┐
│ Untrusted: the public internet                                   │
│   - Browser clients (dashboard users)                             │
│   - API key holders (machine clients)                              │
│   - Anonymous/anyone (unauthenticated endpoints, attackers)          │
└──────────────────────────┬────────────────────────────────────────┘
                            │  TLS, at the Container Apps / APIM edge
┌───────────────────────────▼───────────────────────────────────────┐
│ Semi-trusted: authenticated principals                              │
│   - JWT-holding users, scoped by role/permission                     │
│   - API-key-holding clients, scoped by explicit scope list             │
└──────────────────────────┬────────────────────────────────────────┘
                            │  RBAC / scope checks, per-route
┌───────────────────────────▼───────────────────────────────────────┐
│ Trusted: the gateway process itself                                  │
│   - Holds JWT signing secret, Redis credentials, third-party API keys │
│   - Decides what's allowed; everything above must go through it        │
└──────────────────────────┬────────────────────────────────────────┘
                            │  SSRF allowlist + DNS pinning + circuit breaker
┌───────────────────────────▼───────────────────────────────────────┐
│ External: upstream services the gateway proxies to                    │
│   - Not controlled by this codebase - treated as untrusted output      │
│     sources and only reachable via the allowlist                        │
└─────────────────────────────────────────────────────────────────────┘
```

Within Azure, a second boundary exists between the **Container App's managed identity**
(scoped to exactly AcrPull on the registry and Secrets User on the Key Vault - nothing
else) and **whoever runs `terraform apply`** (scoped to Secrets Officer on the Key
Vault, plus whatever the deployer's own Azure RBAC already grants them at the
subscription level - Terraform doesn't attempt to constrain that).

## Assets

| Asset | Where | Impact if compromised |
|---|---|---|
| JWT signing secret | Key Vault → Container App env (`JWT_SECRET`) | Forge arbitrary tokens for any user/role |
| Cookie secret | Key Vault → Container App env (`COOKIE_SECRET`) | Forge/tamper signed cookies |
| Redis credentials | Key Vault → Container App env (`REDIS_PASSWORD`) | Read/write all rate-limit, token, audit, and API-key state |
| User passwords (hashed) | In-process demo user store | bcrypt-hashed; a leak doesn't directly yield plaintext, but does yield an offline-crackable target |
| Refresh/access tokens | Redis (`token:*`, `token:blacklist:*`, `token:family:*`) | Session hijacking if stolen from Redis directly (not exposed via any API) |
| API keys | Redis (`apikey:*`), raw value only ever shown once at creation | Whatever scopes were granted at creation time |
| Audit log | Redis (`audit:*`) / file (`logs/audit-logs.json`) | Tamper-evident (hash chain), not tamper-*proof* - see residual risk below |
| Third-party API keys (AbuseIPDB) | Key Vault, manually seeded | Rate-limit exhaustion / cost on the third-party service |

## Abuse cases and mitigations

### 1. Credential stuffing / brute force against `/auth/login`
- **Mitigation**: Redis-backed rate limit (`RATE_LIMIT_AUTH_MAX`, default 5/min),
  account lockout after `MAX_LOGIN_ATTEMPTS` (Redis-backed, keyed by username+IP),
  generic "invalid credentials" message (no username enumeration), bcrypt with
  constant-time comparison.
- **Residual risk**: no CAPTCHA; a distributed attack across many source IPs can still
  spread out below the per-IP rate limit while hammering a single username's lockout
  counter (which is IP-independent by design - it has to be, or the lockout itself
  becomes trivially bypassable by rotating IPs). Threat-intel scoring
  (`src/modules/admin/threat-intel.service.ts`) flags this pattern for an operator to
  see even when individual limits aren't tripped.

### 2. Stolen/leaked access or refresh token
- **Mitigation**: short access-token lifetime (15m default); refresh-token rotation
  with reuse detection; a detected reuse revokes the **entire token family** (every
  access + refresh token issued across that login's rotation chain), not just the
  reused token; access tokens can now also be explicitly revoked (on logout) rather
  than only expiring naturally - this was a real gap fixed in this modernization pass
  (`src/middleware/auth.ts`, previously a `// TODO`).
- **Residual risk**: a token stolen and used *before* rotation/reuse detection fires
  is valid until its natural expiry or an explicit revocation. There's no device
  binding or IP pinning on tokens (deliberately - it breaks for legitimate users behind
  rotating mobile IPs/NAT far more often than it stops attackers).

### 3. SSRF via the proxy (`/upstream/echo`, `reports.service.ts`)
- **Mitigation**: hostname allowlist (`ALLOWED_UPSTREAM_HOSTS`) + private-IP blocking
  (RFC 1918, loopback, link-local, IPv6 equivalents) + **DNS-pinning**: the validated
  IP is what's actually dialed, via a per-request undici dispatcher with a custom
  lookup - closing the DNS-rebinding TOCTOU gap where a first (validation) lookup and
  a second (connection) lookup could answer differently. See
  `src/lib/httpClient.ts`.
- **Residual risk**: allowlist entries are hostnames, not endpoints - if an allowlisted
  host is itself compromised or serves attacker-controlled content, the gateway will
  faithfully proxy it. This is inherent to the proxy pattern, not a gap in this
  implementation specifically.
- **Local-dev escape hatch**: `SSRF_ALLOW_PRIVATE_IPS` (default `false`) skips the
  private-IP check specifically because Docker Compose's `mock-service` resolves to a
  private container-network IP, which the check correctly blocks otherwise - without
  it, the proxy/reports demo simply doesn't work locally. `docker-compose.yml` is the
  only place this is set to `true`; `env.ts` refuses it outright when
  `NODE_ENV=production`, so it can't leak into a real deployment.

### 3b. Malicious website making credentialed cross-origin requests
- **Mitigation**: explicit CORS origin allowlist (`CORS_ORIGIN` → `env.security.corsOrigins`,
  enforced in `src/app.ts`'s `@fastify/cors` registration). Fixed in this pass - the
  plugin was previously hardcoded to `origin: true` (reflect any origin) with
  `credentials: true`, which would have let *any* website read cookie-authenticated
  responses from a logged-in victim's browser. The env-level wildcard rejection in
  `env.ts` was real but had nothing enforcing it downstream until now.
- **Residual risk**: none specific beyond keeping the allowlist accurate as new
  frontend origins (e.g. Vercel preview URLs) are added.

### 4. Cascading failure from a degraded upstream
- **Mitigation**: per-host circuit breaker (`src/lib/circuitBreaker.ts`) - after
  `CIRCUIT_BREAKER_FAILURE_THRESHOLD` consecutive failures, further requests to that
  host fail fast (503) for `CIRCUIT_BREAKER_COOLDOWN_MS` instead of piling up retries
  and timeouts against an already-struggling service.
- **Residual risk**: circuit state is in-process (per gateway instance), not shared via
  Redis - with N replicas, each has to independently trip its own breaker. Acceptable
  for this deployment's scale; would need a Redis-backed breaker to be exactly
  consistent across replicas.

### 5. Abuse of proxy/report endpoints by an authenticated user or API key
- **Mitigation**: per-user and per-API-key Redis-backed rate limits, separate buckets
  (an API key doesn't compete with interactive users for the same quota, and vice
  versa); API keys are scoped (`proxy:access` etc.) so a leaked key only grants what it
  was explicitly issued for.
- **Residual risk**: no per-tenant/organization limits - this deployment has no
  multi-tenancy concept, only individual users and individual API keys.

### 6. Privilege escalation via RBAC/permission bypass
- **Mitigation**: role/permission checks on every protected route
  (`requireRole`/`requirePermission` in `src/middleware/rbac.ts`), enforced
  server-side on every request (not just at login); permission denials are
  audit-logged.
- **Residual risk**: RBAC is static (roles/permissions hardcoded in
  `auth.service.ts`'s `ROLES` map), not a dynamic policy engine - adequate for this
  project's scope, but wouldn't scale to a real multi-tenant admin model without
  rework.

### 7. Audit log tampering (covering tracks after a compromise)
- **Mitigation**: SHA-256 hash chain over every audit entry
  (`src/modules/audit/audit.hash.ts`) - editing or deleting a past entry breaks the
  chain at that point, detectable via `GET /admin/audit-logs/verify`.
- **Residual risk**: **tamper-evident, not tamper-proof.** An attacker with direct
  write access to the Redis instance (or the log file) could, in principle, recompute
  the entire chain from their edit point forward, since nothing anchors the hash chain
  outside the store's own reach. Real immutability needs an external anchor (e.g.
  periodically publishing the latest hash to independent, append-only storage) - not
  implemented here; see [`SECURITY_CONTROLS.md`](SECURITY_CONTROLS.md#roadmap).

### 8. Secret exposure via logs or error responses
- **Mitigation**: Pino field-level redaction (`Authorization`, `Cookie`, password/token
  fields - `src/lib/logger.ts`); production error responses never include stack
  traces or internal messages (`src/lib/errors.ts`); Key Vault holds real secret
  values, never committed to the repo (enforced by `.gitignore` on `.env`,
  `*.tfvars`, `backend.tf`).
- **Residual risk**: relies on developers not adding new fields that leak secrets
  without updating the redaction list - there's no automated scan for this in CI today
  (a reasonable addition, not currently implemented).

### 9. Supply-chain compromise (malicious/vulnerable dependency)
- **Mitigation**: `npm audit` + Dependency Review in CI
  (`.github/workflows/dependency-review.yml`), SBOM generation, container image
  scanning (Trivy) with SARIF upload for both the app and the base image.
- **Residual risk**: no signed-provenance verification (e.g. Sigstore/cosign) on
  either the npm dependency tree or the built container image - documented as a
  roadmap item, not implemented.

### 10. Compromise of the Azure deployment pipeline itself
- **Mitigation**: least-privilege managed identity for the running app (AcrPull +
  Key Vault Secrets User only - not Owner/Contributor on the resource group); the
  deploy workflow needs its own scoped credentials (OIDC federated credential
  recommended over a long-lived service principal secret - see
  `.github/workflows/deploy.yml`).
- **Residual risk**: whoever can push to `main` (or trigger the deploy workflow) can
  ship arbitrary code to production - standard CI/CD trust model, not specific to this
  project. Branch protection and required reviews are a GitHub repo setting, not
  something Terraform/CI config alone enforces.

## What's explicitly out of scope

- Physical/hardware security of Azure's infrastructure.
- The security of arbitrary upstream services this gateway is configured to proxy to
  - they're an external trust boundary (see diagram above), not something this
  codebase can guarantee.
- Multi-tenancy / tenant isolation - this is a single-tenant deployment model.
- DDoS mitigation at the network layer (Azure Front Door / DDoS Protection are
  documented as an available upgrade path, not deployed by default here - see
  `docs/OPERATIONS.md`).
