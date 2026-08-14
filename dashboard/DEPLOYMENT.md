# Azure Static Web Apps deployment

The supported public path is Azure Static Web Apps (SWA) for this Vite SPA and Azure
Container Apps for the API. Terraform provisions both and automatically includes the
SWA origin in the API's CORS allowlist.

## One-time repository configuration

Configure the existing GitHub OIDC identity values plus these scoped values:

- `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`
- `RESOURCE_GROUP`, `CONTAINER_APP_NAME`, `STATIC_WEB_APP_NAME`
- `AZURE_STATIC_WEB_APPS_API_TOKEN` from Terraform's sensitive
  `static_web_app_deployment_token` output

Do not configure a copied `VITE_API_URL` repository variable. The dashboard workflow
logs into Azure, queries the current Container App FQDN, requires an HTTPS origin, and
passes that value to the production build.

## Deploy and verify

Run `.github/workflows/deploy-dashboard.yml` or push a dashboard change to `main`.
After upload, the workflow invokes the reusable Azure Playwright smoke workflow. It
checks SPA hard refresh, reviewer auth and API access, refresh recovery, logout and
revocation, exact-origin behavior, browser CORS errors, and absence of privileged
fixture credentials.

For custom dashboard domains, add only their HTTPS origins to Terraform's
`additional_cors_origins` set. The default SWA hostname requires no manual CORS entry.

Historical Vercel notes are archived in
[`legacy/deploy-configs/vercel-dashboard.md`](../legacy/deploy-configs/vercel-dashboard.md).
