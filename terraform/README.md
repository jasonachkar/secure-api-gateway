# Terraform — Azure deployment

Provisions the backend half of the architecture described in the root README: Azure
Container Apps running the gateway, backed by Azure Container Registry, Key Vault,
Azure Cache for Redis, and Log Analytics / Application Insights. The frontend
(`dashboard/`) deploys to Vercel by default (outside this Terraform) - optionally to
Azure Static Web Apps instead, via `enable_azure_static_web_app` (see "Frontend
hosting" below).

## What gets created (default path)

| Resource | Purpose | Cost |
|---|---|---|
| Resource Group | Container for everything below | Free |
| Log Analytics workspace | Central logs, capped at `log_analytics_daily_quota_gb` | Free up to 5GB/mo, then ~$2.30/GB |
| Application Insights | App-level tracing/metrics (Node.JS) | Shares the Log Analytics free grant |
| Container Registry (Basic) | Stores the gateway image | ~$5/mo |
| Key Vault (Standard) | `cookie-secret`, `jwt-secret`, `redis-password` | Pennies (per-operation billing) |
| Container Apps Environment + App | Runs the gateway, scale-to-zero by default | Free grant covers light/demo traffic; consumption-priced beyond that |
| Azure Cache for Redis (Basic C0) | Rate limiting, token/session state, audit log, API keys | **~$16/mo — the one real fixed cost in this stack** |

Everything except Redis realistically fits Azure's free-tier credits for a low-traffic
demo. If you want a genuinely $0-at-rest deployment, set `enable_redis = false` — the
app documents the degraded fallback behavior without Redis in
[`docs/OPERATIONS.md`](../docs/OPERATIONS.md).

### Optional (all `false` by default)

- **`enable_apim`** — puts Azure API Management in front of the Container App for
  edge-level rate limiting, CORS, and header-stripping policies (see
  `modules/apim`). Even the cheapest SKU with policy support (Developer) runs
  **~$50+/mo with no SLA** and takes 30-45 minutes to provision — enable it to
  demonstrate the pattern, not as part of the default cost-conscious path.
- **`enable_vnet`** — VNet-integrates the Container Apps environment (see
  `modules/networking`). The default path is public ingress with no private
  networking, which is simpler and free; this exists to demonstrate a more
  locked-down topology (see [`docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md)).
- **`enable_azure_static_web_app`** — provisions Azure Static Web Apps for the
  dashboard (see `modules/static-web-app`) instead of/alongside Vercel. Free tier.
  See "Frontend hosting: Vercel vs Azure Static Web Apps" below.
- **`enable_aws_cloudwatch_ingestion`** — provisions a dedicated AWS CloudWatch Logs
  log group plus a least-privilege IAM reader (see `modules/aws-logging`), and wires
  real credentials into the gateway so its CloudWatch ingestion adapter actually
  polls it. **$0 at demo scale** (CloudWatch Logs' free tier is 5GB/mo ingestion +
  storage, on an ongoing basis, not just a first-year grant) — **the real cost is a
  second static cloud credential (an IAM access key) to manage and rotate.**
- **`enable_gcp_logging_ingestion`** — provisions a read-only (`roles/logging.viewer`)
  GCP service account in an existing project (see `modules/gcp-logging`); no log
  source needs provisioning since every GCP project already captures activity/audit
  logs. **$0 at demo scale** (Cloud Logging's free tier is 50GiB/mo) — **the real
  cost is a third cloud credential (a service account key) to manage and rotate.**
  Unlike AWS's ARN-scoped IAM, GCP has no log-name-scoped grain — project-level
  `roles/logging.viewer` is the finest read-only role available.

## Frontend hosting: Vercel vs Azure Static Web Apps

The default path (`enable_azure_static_web_app = false`) leaves the dashboard on
Vercel — it's already working, free, and Vercel's zero-config DX / instant PR
previews are genuinely better than what you'd get self-hosting a SPA. **Vercel +
Azure backend is a normal, real-world pattern, not a compromise.**

If you'd rather keep everything on one cloud, set `enable_azure_static_web_app = true`
and apply. Azure gives you a public HTTPS domain automatically either way — Container
Apps' `container_app_url` output and, if enabled, the Static Web App's
`static_web_app_url` output both work immediately with **no custom domain purchase or
DNS setup required** (Static Web Apps' free tier supports adding a custom domain
later if you want one, but it's optional).

What Terraform automates:
- The Static Web App resource itself (with its `<name>.azurestaticapps.net` domain)
- Folding that URL into the gateway's `CORS_ORIGIN` automatically (`local.cors_origins_combined`
  in `main.tf`) — no separate manual CORS update needed

What's still manual, and why: `.github/workflows/deploy-dashboard.yml` builds and
pushes the dashboard on every push to `dashboard/**`, but it needs two values only
available after `terraform apply`:

```bash
# 1. Deployment token -> GitHub repo secret AZURE_STATIC_WEB_APPS_API_TOKEN
terraform output -raw static_web_app_deployment_token

# 2. Backend URL (baked into the Vite build at build time) -> GitHub repo variable VITE_API_URL
terraform output -raw container_app_url
```

Add both under **Settings → Secrets and variables → Actions** (the token as a
*Secret*, the URL as a *Variable*), then push to `main` (or re-run the workflow) to
trigger the first deploy. This can't be fully automated without giving Terraform a
GitHub personal access token with repo/workflow write scope — a broader, longer-lived
credential than the narrow, single-purpose deployment token the workflow actually
needs, so it's a deliberate two-step manual handoff rather than a gap.

## Prerequisites

- Terraform >= 1.6
- An Azure subscription and the [Azure CLI](https://learn.microsoft.com/cli/azure/install-azure-cli), logged in: `az login`
- Docker, to build and push the gateway image after the first apply
- Only if `enable_aws_cloudwatch_ingestion = true`: AWS credentials the AWS provider can
  pick up ambiently (`aws configure`, `AWS_PROFILE`, or SSO)
- Only if `enable_gcp_logging_ingestion = true`: GCP Application Default Credentials
  (`gcloud auth application-default login`) for an existing project

## First deployment

```bash
cd terraform
terraform init                      # local state to start - see "Remote state" below
cp environments/dev.tfvars.example environments/dev.tfvars
# edit dev.tfvars: at minimum set cors_origin to your Vercel URL

terraform plan  -var-file=environments/dev.tfvars
terraform apply -var-file=environments/dev.tfvars
```

This provisions everything, including **real, unique** values for `COOKIE_SECRET` and
`JWT_SECRET` written straight into Key Vault (via `random_password` +
`azurerm_key_vault_secret`) — there's no manual secret-seeding step for the app to
boot. The Container App starts with a public placeholder image
(`mcr.microsoft.com/azuredocs/containerapps-helloworld`) since ACR is empty on a first
apply; `terraform apply` prints the exact next commands as the `next_steps` output, or
copy them from below.

### Push the real image and point the app at it

```bash
# From the repo root, not terraform/
ACR_LOGIN_SERVER=$(terraform -chdir=terraform output -raw acr_login_server)
CONTAINER_APP=$(terraform -chdir=terraform output -raw container_app_name)
RESOURCE_GROUP=$(terraform -chdir=terraform output -raw resource_group_name)

docker build -t "$ACR_LOGIN_SERVER/secure-api-gateway:latest" .
az acr login --name "${ACR_LOGIN_SERVER%%.*}"
docker push "$ACR_LOGIN_SERVER/secure-api-gateway:latest"

az containerapp update \
  --name "$CONTAINER_APP" \
  --resource-group "$RESOURCE_GROUP" \
  --image "$ACR_LOGIN_SERVER/secure-api-gateway:latest"
```

`.github/workflows/deploy.yml` automates exactly this sequence on push to `main`, once
the required repo secrets are set (see that workflow's header comment). Terraform is
configured with `lifecycle.ignore_changes` on the container image specifically so this
out-of-band update isn't reverted by the next `terraform apply`.

### Verify

```bash
curl https://$(terraform -chdir=terraform output -raw container_app_name).<region>.azurecontainerapps.io/healthz
# or just:
terraform -chdir=terraform output container_app_url
curl "$(terraform -chdir=terraform output -raw container_app_url)/healthz"
```

## Seeding optional secrets

Anything Terraform can't generate itself (third-party API keys) is seeded manually:

```bash
KEY_VAULT=$(terraform -chdir=terraform output -raw key_vault_name)

az keyvault secret set --vault-name "$KEY_VAULT" --name "abuseipdb-api-key" --value "<your-key>"
```

Add the matching `secret_env_vars` entry in `main.tf`'s `module "container_app"` block
if you want it surfaced as an env var, then `terraform apply` again — the Container App
resource references secrets by name, so this doesn't require recreating anything.

## Rotating secrets

- **Generated secrets** (`cookie-secret`, `jwt-secret`): `terraform taint random_password.cookie_secret` (or `.jwt_secret`) then `terraform apply`. This generates a new value and updates the Key Vault secret; the Container App picks it up on its next revision (restart it if you need the rotation to take effect immediately: `az containerapp revision restart`).
- **Manually-seeded secrets**: re-run the `az keyvault secret set` command above with a new value.
- **Redis password**: `az redis regenerate-keys` (Azure-side), or destroy/recreate the `module.redis` resource via Terraform.
- **AWS CloudWatch reader key**: `terraform taint 'module.aws_logging[0].aws_iam_access_key.reader'` then `terraform apply` - generates a new access key and updates Key Vault; the old key stays valid until the next apply completes.
- **GCP Logging service account key**: `terraform taint 'module.gcp_logging[0].google_service_account_key.reader'` then `terraform apply`.

See [`docs/SECURITY_CONTROLS.md`](../docs/SECURITY_CONTROLS.md) for the fuller secrets-rotation runbook.

## Remote state

Local state (the default above) is fine for a first try, but isn't safe for anything
you'll come back to or share. To use Azure Storage as a remote backend:

```bash
# One-time bootstrap - creates the storage account state will live in
az group create --name rg-terraform-state --location eastus
az storage account create \
  --name <globally-unique-name> \
  --resource-group rg-terraform-state \
  --sku Standard_LRS \
  --encryption-services blob
az storage container create \
  --account-name <globally-unique-name> \
  --name tfstate
```

Then:

```bash
cp backend.tf.example backend.tf
# edit backend.tf: set storage_account_name to the name you just created
terraform init -migrate-state
```

Never commit `backend.tf` or `*.tfvars` (only the `.example` templates) — both are
already in `.gitignore`.

## Destroying

```bash
terraform destroy -var-file=environments/dev.tfvars
```

Key Vault has `purge_protection_enabled = false` in this configuration specifically so
`destroy` fully removes it instead of leaving a soft-deleted vault around for 7 days
(which would also block recreating a vault with the same name). Turn purge protection
on (`terraform/modules/key-vault/main.tf`) before treating this as a real production
deployment you don't intend to tear down.

## Module layout

```
terraform/
├── main.tf                  # wires everything together
├── variables.tf / outputs.tf / locals.tf / providers.tf
├── backend.tf.example        # copy to backend.tf for remote state
├── environments/
│   ├── dev.tfvars.example
│   └── prod.tfvars.example
└── modules/
    ├── acr/               # Container Registry
    ├── key-vault/         # Key Vault (RBAC-authorized)
    ├── monitoring/        # Log Analytics + Application Insights
    ├── redis/             # Azure Cache for Redis (optional, enable_redis)
    ├── container-app/     # Container Apps environment + the gateway app itself
    ├── apim/               # Azure API Management front door (optional, enable_apim)
    ├── networking/         # VNet integration (optional, enable_vnet)
    ├── static-web-app/     # Dashboard hosting (optional, enable_azure_static_web_app)
    ├── aws-logging/        # CloudWatch log group + IAM reader (optional, enable_aws_cloudwatch_ingestion)
    └── gcp-logging/        # Cloud Logging service account (optional, enable_gcp_logging_ingestion)
```

Each module takes plain inputs and returns plain outputs — there's no hidden global
state or cross-module magic. `main.tf` is the only place that decides what's wired to
what, which is deliberately kept boring and readable over clever.

## Design notes worth knowing before you change this

- **Container App identity is user-assigned, not system-assigned.** The ACR-pull and
  Key-Vault-read role grants have to exist *before* the Container App can start; a
  system-assigned identity's principal ID isn't known until the Container App itself
  is created, which is a circular dependency. A user-assigned identity is a separate
  resource created first, so the role assignments can land before the app that needs
  them (`modules/container-app/main.tf`).
- **JWT uses HS256 in this deployment, not RS256.** The app supports both, but RS256
  needs the private/public key *files* on disk (`JWT_PRIVATE_KEY`/`JWT_PUBLIC_KEY` are
  file paths, not raw PEM env vars — see `src/config/env.ts`). Getting Key-Vault-backed
  secrets onto the filesystem needs a Container Apps secret volume mount, which is a
  real feature but adds meaningful HCL complexity for a benefit (asymmetric signing)
  this deployment doesn't need. HS256 with a Key-Vault-generated 64-byte secret is the
  pragmatic default here; switching to RS256+volume-mount is a documented roadmap item
  in [`docs/SECURITY_CONTROLS.md`](../docs/SECURITY_CONTROLS.md).
- **`terraform validate` passes with real provider schema checking** (this repo has
  internet access to the Terraform registry in CI - see `.github/workflows/terraform.yml`).
  It cannot catch everything `plan`/`apply` would (auth, quota, region availability),
  since those require real Azure credentials.
- **AWS/GCP ingestion credentials are static, not federated, and live in Terraform
  state.** `modules/aws-logging`/`modules/gcp-logging` provision a long-lived IAM
  access key / service account key rather than cross-cloud OIDC federation (Azure
  Workload Identity → AWS STS / GCP Workload Identity Federation). Federation would
  avoid a static credential entirely, but adds real setup complexity (configuring
  Entra ID as a trusted OIDC issuer on the AWS/GCP side) for a demo-scale
  integration; static, narrowly-scoped credentials rotated via `terraform taint` (see
  "Rotating secrets" above) is the pragmatic default here, consistent with how this
  repo already accepts the same tradeoff for its own `random_password`-generated
  secrets. Revisit if this ever needs to be a genuine production deployment.
