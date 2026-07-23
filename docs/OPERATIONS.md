# Operations

Primary deployment target: **Azure Container Apps**, provisioned via
[`terraform/`](../terraform). This doc covers day-to-day operation of that deployment;
for provisioning/destroying infrastructure see [`terraform/README.md`](../terraform/README.md).

## Startup & health checks

The app validates its entire configuration at startup (`src/config/env.ts`) and exits
immediately with a clear error list if anything's missing or invalid - it will not boot
into a partially-configured state.

- **`GET /healthz`** — liveness. Returns `{status: "ok"}` if the process is up. Doesn't
  check dependencies - used by Container Apps' liveness probe.
- **`GET /readyz`** — readiness. Also checks the Redis connection; returns `degraded`
  if Redis is unreachable. Used by Container Apps' readiness probe
  (`terraform/modules/container-app/main.tf`).

```bash
curl "$(terraform -chdir=terraform output -raw container_app_url)/healthz"
curl "$(terraform -chdir=terraform output -raw container_app_url)/readyz"
```

### Redis unavailability

Redis is load-bearing: rate limiting, token/session state, the audit log (production
store), and API keys all live there. If Redis is unreachable:
- `/readyz` reports `degraded` (500) so Container Apps' readiness probe can route
  traffic away from the affected replica.
- Login/refresh/API-key validation will fail loudly (500s), not silently succeed with
  no rate limiting or revocation checking - this is intentional; a gateway that
  quietly disables its own security controls under partial failure is worse than one
  that fails closed.
- For **local development only**, `docker-compose.yml` starts Redis alongside the
  gateway automatically, so this shouldn't come up in the primary local-dev path. If
  you're running the gateway outside Compose, start Redis yourself first
  (`docker run -d -p 6379:6379 redis:7-alpine`) - there's no fallback mode.

## Monitoring

- **Log Analytics + Application Insights** (`terraform/modules/monitoring`) — all
  container stdout/stderr flows to Log Analytics automatically; Application Insights
  receives app-level telemetry via `APPLICATIONINSIGHTS_CONNECTION_STRING`.
- **Structured logs** — every log line is JSON (Pino), with `requestId` correlation
  across the request lifecycle and sensitive fields redacted (`src/lib/logger.ts`).
- **`GET /admin/metrics/summary`, `GET /admin/metrics/realtime`** (SSE) — request rate,
  error rate, auth stats (failed logins, lockouts), rate-limit violations, response
  time percentiles. Backs the dashboard's live view.
- **`GET /admin/upstream-health`** — circuit breaker state per upstream host
  (closed/open/half-open, consecutive failures) - check this first if upstream calls
  start failing broadly.
- **`GET /admin/audit-logs`, `GET /admin/audit-logs/verify`** — query the security
  event log; verify its tamper-evident hash chain.
- **`GET /admin/threats`** (`threat-intel.controller.ts`) — per-IP threat scores and
  detected attack patterns (brute force, credential stuffing, rate-limit abuse).

### What to alert on

| Signal | Where | Why it matters |
|---|---|---|
| `/readyz` returning degraded | Container Apps health probe | Redis down - most functionality degrades |
| Sustained 5xx rate | `/admin/metrics/summary`, App Insights | App-level failure |
| Circuit breaker open on a critical upstream | `/admin/upstream-health` | That upstream is down; requests to it are failing fast, not queuing |
| Spike in `ACCOUNT_LOCKED` / `LOGIN_FAILURE` events | `/admin/audit-logs`, threat-intel | Possible brute-force/credential-stuffing campaign |
| `RATE_LIMIT_EXCEEDED` spike from one IP/user | `/admin/audit-logs` | Possible abuse or a misbehaving client |
| Audit chain verification failing | `/admin/audit-logs/verify` | Possible tampering - treat as a security incident, see `INCIDENT_RESPONSE.md` |

## Deployment flow

1. Push to `main` (or open a PR) → `.github/workflows/ci.yml` runs lint, typecheck,
   tests, and builds both the backend and dashboard.
2. On merge to `main`, `.github/workflows/deploy.yml` (manual `workflow_dispatch` by
   default - promote to automatic once you're comfortable with it) builds the Docker
   image, pushes to ACR, and runs `az containerapp update` to roll it out.
3. Container Apps performs the update as a new revision; `revision_mode = "Single"`
   (`terraform/modules/container-app`) means the new revision fully replaces the old
   one once healthy (no manual traffic-splitting step, at the cost of no built-in
   canary - see "Rollback" below for how to fall back to a previous revision instead).
4. The dashboard deploys independently via Vercel's own GitHub integration - pushes to
   `main` trigger a Vercel build automatically once the Vercel project is linked (see
   `dashboard/DEPLOYMENT.md`).

### Rollback

Container Apps keeps prior revisions around (subject to `max_inactive_revisions`).
To roll back:

```bash
az containerapp revision list -n <container-app-name> -g <resource-group> -o table
az containerapp ingress traffic set \
  -n <container-app-name> -g <resource-group> \
  --revision-weight <previous-revision-name>=100
```

Or redeploy a known-good image tag with `az containerapp update --image ...` (the same
command CI uses).

## Scaling

- `container_min_replicas`/`container_max_replicas` (Terraform variables) control the
  Container App's replica range. `min_replicas = 0` (the default) allows scale-to-zero
  when idle - free while unused, at the cost of a cold start on the next request.
- Container Apps autoscales on HTTP concurrency by default; for sustained higher
  traffic, raise `container_cpu`/`container_memory` (must stay on one of Container
  Apps' fixed cpu/memory pairings) before raising `max_replicas`.
- Redis (Basic C0) is the most likely bottleneck under real load - it has no
  replication or SLA. `terraform/environments/prod.tfvars.example` uses `Standard`
  instead for exactly this reason.

## Common tasks

```bash
# Tail logs
az containerapp logs show -n <container-app-name> -g <resource-group> --follow

# Restart (new revision, same image - picks up rotated Key Vault secrets)
az containerapp revision restart -n <container-app-name> -g <resource-group>

# Scale manually
az containerapp update -n <container-app-name> -g <resource-group> --min-replicas 1 --max-replicas 5

# Clear a rate limit key directly (use with caution)
redis-cli -h <redis-host> -p 6380 --tls -a <password> DEL "ratelimit:global:<ip>"

# Unlock an account
redis-cli -h <redis-host> -p 6380 --tls -a <password> DEL "lockout:<username>:<ip>"

# Revoke a specific token by jti
redis-cli -h <redis-host> -p 6380 --tls -a <password> SETEX "token:blacklist:<jti>" 604800 "1"
```

## Local development

The one supported local path is Docker Compose:

```bash
cp .env.example .env   # then edit as needed
docker compose up --build
```

Starts the gateway (`:3000`), mock upstream service (`:4000`), Redis (`:6379`), and the
dashboard (`:5173`) together. See the root [`README.md`](../README.md) for the full
local setup walkthrough, including running components individually without Compose.

## Backup & recovery

Redis in this deployment holds **operational state** (rate limits, sessions, the audit
log, API keys) - not a system of record. Azure Cache for Redis (Basic/Standard) has
built-in persistence options, but the practical recovery story for this project is
simpler: Redis data loss means rate limits reset, all active sessions are invalidated
(users re-login), and recent audit history since the last successful state is gone. For
audit-log durability beyond Redis's own persistence, ship logs to Log Analytics (already
wired via container stdout) as the durable copy.

## Appendix: alternative deployment platforms

This project's supported path is Docker Compose (local) + Azure Container Apps +
Vercel. The `Dockerfile` is a standard multi-stage Node.js build with no
platform-specific assumptions, so it should also run with minimal changes on:

- **Kubernetes** — deploy the same image with a standard Deployment + Service +
  Ingress; point `/healthz`/`/readyz` at liveness/readiness probes; use a Kubernetes
  Secret (or an external-secrets operator against Key Vault) for env vars.
- **Docker Swarm** — `docker service create` with the same image and env vars;
  configure Traefik or another LB for TLS termination.
- **Fly.io / Railway / Render / a bare VPS** — previously-supported paths, now
  unsupported and archived to [`legacy/deploy-configs/`](../legacy/deploy-configs)
  with notes on what's there.

None of these are tested or maintained as part of this repo's CI - treat them as a
starting point if you need a non-Azure target, not a guarantee.
