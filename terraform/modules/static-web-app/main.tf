/**
 * Azure Static Web Apps hosting for the dashboard - the Azure-native alternative to
 * Vercel (var.enable_azure_static_web_app at the root, false by default - Vercel
 * remains the default frontend host, see terraform/README.md for why).
 *
 * This resource is deliberately NOT linked to the GitHub repo via repository_url/
 * repository_token: doing so would require handing Terraform a GitHub PAT with
 * repo/workflow write access (a broad, long-lived credential) just so Azure can
 * auto-generate a CI workflow. Instead, this stands alone and CI
 * (.github/workflows/deploy-dashboard.yml) pushes builds to it using the narrower
 * `api_key` deployment token below - the same "scoped credential over standing
 * access" preference applied to the backend's OIDC-based deploy workflow.
 */

resource "azurerm_static_web_app" "dashboard" {
  name                = var.name
  resource_group_name = var.resource_group_name
  location            = var.location
  sku_tier            = var.sku_tier
  sku_size            = var.sku_tier

  tags = var.tags

  lifecycle {
    # repository_branch/repository_url got set on the real resource out-of-band (e.g. via
    # the Azure Portal's "link to GitHub" flow) - this config never sets them, on purpose
    # (see the module comment above), so ignore drift on both instead of nulling them out
    # on every apply. Same "don't fight out-of-band changes" pattern as the Container
    # App's image (modules/container-app).
    ignore_changes = [repository_branch, repository_url]
  }
}
