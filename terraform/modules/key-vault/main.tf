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
  # protection defaults off (see variables.tf) so a demo/dev vault can actually be
  # torn down with `terraform destroy` instead of lingering in a 7-90 day
  # soft-deleted state. Documented, deliberate trade-off for a reference
  # deployment - not an oversight. Set purge_protection_enabled = true for a real
  # production deployment; see docs/KNOWN_LIMITATIONS.md.
  # tfsec:ignore:azure-keyvault-no-purge
  purge_protection_enabled   = var.purge_protection_enabled
  soft_delete_retention_days = 7

  # Explicit network ACL - see variables.tf for why "Allow" is the reference-deployment
  # default: this stack has no VNet integration wired by default (enable_vnet is
  # optional), so a default "Deny" would cut off the Container App's own access to
  # its secrets. AzureServices is bypassed so Azure-internal callers aren't blocked
  # even once default_action is switched to "Deny". Set network_default_action =
  # "Deny" plus allowed_subnet_ids once VNet integration is enabled; see
  # docs/KNOWN_LIMITATIONS.md.
  # tfsec:ignore:azure-keyvault-specify-network-acl
  network_acls {
    default_action             = var.network_default_action
    bypass                     = "AzureServices"
    virtual_network_subnet_ids = var.allowed_subnet_ids
  }

  tags = var.tags
}
