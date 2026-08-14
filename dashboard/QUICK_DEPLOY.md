# Quick Azure dashboard deployment

1. Provision with `enable_azure_static_web_app = true` (the default).
2. Add the SWA deployment token and existing Azure OIDC/resource-name values described
   in [`DEPLOYMENT.md`](DEPLOYMENT.md) to GitHub Actions.
3. Run the `Deploy Dashboard (Azure Static Web Apps)` workflow.
4. Confirm its `Public Azure session journey` job succeeds.

The workflow discovers the current API and dashboard URLs from Azure. Never copy a
Container App hostname into a long-lived `VITE_API_URL` repository variable.
