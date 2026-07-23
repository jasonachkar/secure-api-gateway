/**
 * Azure Cache for Redis. This is the one resource in the whole stack with a real,
 * unavoidable monthly cost (Basic C0 is ~$16/mo - there is no serverless/consumption
 * tier for Azure Redis). Everything else here fits comfortably in Azure free-tier
 * credits or scales to ~$0 at rest. See terraform/README.md for the cost table and
 * the no-Redis fallback mode if you want a genuinely free deployment.
 */

resource "azurerm_redis_cache" "main" {
  name                = var.name
  resource_group_name = var.resource_group_name
  location            = var.location
  sku_name            = var.sku_name
  family              = "C"
  capacity            = var.capacity

  minimum_tls_version           = "1.2"
  non_ssl_port_enabled          = false
  public_network_access_enabled = true # no VNet integration by default - see var.enable_vnet

  tags = var.tags
}
