# Azure Deployment Plan

> **Status:** Ready for Validation

Generated: 2026-08-12

## 1. Project Overview

**Goal:** Repair and harden the complete authentication lifecycle for the Azure Static Web Apps dashboard, Azure Container Apps API, and Azure Cache for Redis deployment.

**Path:** Modify existing Terraform-based Azure application.

## 2. Requirements

| Attribute | Value |
|---|---|
| Classification | Public production portfolio application |
| Scale | Small |
| Budget | Cost-optimized existing SKUs |
| Subscription | SIEM (`449dbbb0-6630-491c-b76a-7ad1c579bab3`) — observed, no deployment authorized |
| Locations | Container Apps/Redis: `eastus`; Static Web Apps: `eastus2` |

## 3. Components Detected

| Component | Type | Technology | Path |
|---|---|---|---|
| gateway | API | Fastify 5, TypeScript, Redis | `src/` |
| dashboard | SPA | React 18, Vite, Axios | `dashboard/` |
| infrastructure | IaC | Terraform | `terraform/` |
| delivery | CI/CD | GitHub Actions | `.github/workflows/` |

## 4. Recipe Selection

**Selected:** Existing Terraform and GitHub Actions workflow.

No AZD conversion, resource provisioning, Terraform apply, commit, push, or deployment is authorized.

## 5. Architecture

`Browser -> Azure Static Web Apps -> Azure Container Apps -> Azure Cache for Redis`

The implementation centralizes CORS/cookie policy, moves access tokens to memory, restores sessions with an HttpOnly refresh cookie, automates deployment URL discovery, and verifies Redis-backed readiness.

## 6. Confirmed Diagnosis

- The deployed SWA bundle contains the deleted dev gateway hostname and receives a DNS failure before auth requests can reach a server.
- The real production API accepts the exact SWA origin and reports Redis ready.
- Independent source defects exist in refresh-cookie SameSite/path, frontend refresh/reload handling, demo seeding, readiness status, error classification, and deployment validation.

## 7. Execution Checklist

- [x] Inspect local implementation and live Azure metadata/read-only HTTP evidence
- [x] Repair backend auth, cookies, origin checks, token rotation, seeding, and readiness
- [x] Repair frontend environment parsing, in-memory session lifecycle, refresh, errors, and SSE auth
- [x] Update Terraform, workflows, local/deployed E2E coverage, and Azure-only documentation
- [x] Run available backend, dashboard, workflow, and Terraform static validation
- [x] Set status to `Ready for Validation`
- [x] Run Azure validation without deployment
- [ ] Run the public Azure Playwright workflow after a future authorized deployment

## 8. Provisioning Limits

No new paid resource type or capacity is being provisioned, and no deployment is authorized. Existing resource names/SKUs remain unchanged; quota validation is therefore not applicable to this code-only preparation.

## 9. Files and Validation

Changes remain in the working tree. No commit, push, Terraform apply, or deployment was performed. Validation used the repository's npm suites, local Redis-backed browser tests, Terraform formatting/init/validate/plan checks, Azure CLI read-only inspection, and static workflow/security checks.

## 10. Research Summary

- Container Apps readiness probes must fail when a required dependency is unavailable; `/healthz` remains the liveness probe and `/readyz` is the Redis-backed readiness probe.
- Runtime secrets remain Key Vault references through the existing user-assigned managed identity; no secret is added to source or workflow output.
- Static Web Apps retains `staticwebapp.config.json` navigation fallback for SPA hard refreshes and deploys through its scoped deployment token.
- The existing pure-Terraform/GitHub Actions recipe is retained to avoid an unrelated AZD migration. No resource names, regions, SKUs, or capacity settings change.
- Cross-site SWA-to-Container-Apps refresh cookies require `SameSite=None; Secure`; this approved requirement overrides generic same-site cookie examples while retaining explicit Origin validation as the compensating CSRF control.

## 11. Implementation and Local Validation Status

- Root `npm ci`: successful (756 packages). npm audit reports 13 dependency findings: 7 moderate and 6 high; no forced dependency upgrades were made.
- Backend lint: successful with 0 errors and 113 existing `no-explicit-any` warnings.
- Backend typecheck, UI-copy check, and production build: successful.
- Backend Jest: 40/40 suites and 277/277 tests passed. Jest reports an existing open-handle warning and does not exit naturally after completing all assertions; the finished process required interruption.
- Dashboard `npm ci`: successful (276 packages). npm audit reports 18 dependency findings: 1 low, 4 moderate, 12 high, and 1 critical; no forced dependency upgrades were made.
- Dashboard Vitest: 5/5 files and 19/19 tests passed.
- Dashboard production build: successful with an HTTPS origin-only `VITE_API_URL`; Vite reports a non-blocking bundle-size warning. The built bundle contains neither the stale dev gateway hostname nor privileged fixture credentials.
- Local Playwright: 52 passed, 2 conditional chart/map tests skipped because their optional live data was absent, 0 failed (54 total). Tests use one worker-scoped authenticated context and no static refresh-cookie storage state.
- Public Azure Playwright workflow: configuration enumerates 1 production smoke test; it was not executed because the changed code was not deployed and deployment is explicitly out of scope.
- Terraform `fmt -recursive -check`, `init -backend=false`, and `validate`: successful with Terraform 1.15.8.
- Read-only Terraform plan (`-refresh=false -lock=false`, production variables): successful with 0 add, 1 in-place change, and 0 destroy. The in-place change canonicalizes CORS, turns production demo mode off, and updates non-sensitive outputs; the saved plan was not applied.
- Workflow YAML parsing and `git diff --check`: successful. Static checks confirm `PROXY_TRUST_MODE = "azure"` appears exactly once and no access-token local/session storage or SSE query-token path remains.

## 12. Azure Validation Evidence

- Azure CLI 2.84.0 is authenticated to subscription SIEM (`449dbbb0-6630-491c-b76a-7ad1c579bab3`) in tenant `e9988106-13a3-4da4-b3cb-999070f910b2`.
- Confirmed production API: `https://secapigw-prod-gateway.bravebush-02981435.eastus.azurecontainerapps.io`.
- Confirmed SWA: `https://salmon-mud-044c6810f.7.azurestaticapps.net`.
- Live pre-change evidence retained: Container App revision `0000004` is running, trusted SWA CORS preflights return 204 with the exact origin, and `/readyz` reported `redis=ok`.
- Static RBAC inspection confirms the application user-assigned identity has `AcrPull` at the registry and `Key Vault Secrets User` at the vault; the deployment principal has `Key Vault Secrets Officer` at the vault. Redis credentials remain Key Vault references.
- Subscription policy inspection found one enforced Security Center built-in initiative. The production resource group has 8 existing Audit/AuditIfNotExists findings (principally Redis, Key Vault, and ACR) and no Deny result affecting this plan. The subscription has 56 existing noncompliance records. This change does not create or destroy resources.
- The isolated global-rate-limit probe now returns HTTP 429 with `Retry-After` and the safe `RATE_LIMIT_EXCEEDED` envelope, rather than 500.

## 13. Remaining Limitations and Deployment Order

- The live SWA still serves the stale bundle until a future authorized deployment; therefore public end-to-end validation cannot pass yet and was intentionally not attempted.
- Existing npm audit findings, Jest open handles, the Vite chunk-size warning, and the existing Azure Policy audit findings are not silently treated as fixed by this auth change.
- Minimal future rollout order: (1) Terraform apply the reviewed production plan, (2) deploy and verify the Container App through `/readyz`, trusted-origin preflight, and reviewer login/logout, (3) deploy SWA using the queried Container App FQDN, then invoke the Azure Playwright workflow.
- No Terraform apply, Azure resource mutation, dashboard/backend deployment, commit, or push was performed.
