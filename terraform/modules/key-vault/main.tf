/**
 * Key Vault using RBAC authorization (not the legacy access-policy model), so all
 * access - including the Container App's managed identity and whoever runs
 * `terraform apply` - is granted via azurerm_role_assignment, consistently with
 * every other resource in this stack.
 */

resource "azurerm_key_vault" "main" {
  name                = var.name
  resource_group_name = var.resource_group_name
  location            = var.location
  tenant_id           = var.tenant_id
  sku_name            = var.sku_name

  rbac_authorization_enabled = true

  # Soft-delete is always on in modern Key Vault and can't be disabled; purge
  # protection is left off so a demo/dev vault can actually be torn down with
  # `terraform destroy` instead of lingering in a 7-90 day soft-deleted state.
  # Turn this on for a real production deployment.
  purge_protection_enabled   = false
  soft_delete_retention_days = 7

  tags = var.tags
}
