/**
 * Azure Container Registry. Admin credentials are disabled - the Container App
 * pulls images using its managed identity (AcrPull role, granted in root main.tf),
 * not a shared admin username/password.
 */

resource "azurerm_container_registry" "main" {
  name                = var.name
  resource_group_name = var.resource_group_name
  location            = var.location
  sku                 = var.sku
  admin_enabled       = false
  tags                = var.tags
}
