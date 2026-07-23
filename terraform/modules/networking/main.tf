/**
 * Optional VNet for Container Apps environment integration (var.enable_vnet in root).
 * Not part of the default deployment path - the default Container Apps environment
 * is public-ingress with no private networking, which is the simpler and cheaper
 * option for a demo. This module exists to demonstrate the more locked-down topology
 * documented in docs/ARCHITECTURE.md, without forcing that complexity on everyone.
 */

resource "azurerm_virtual_network" "main" {
  name                = "${var.name_prefix}-vnet"
  resource_group_name = var.resource_group_name
  location            = var.location
  address_space       = var.address_space
  tags                = var.tags
}

resource "azurerm_subnet" "container_apps" {
  name                 = "container-apps"
  resource_group_name  = var.resource_group_name
  virtual_network_name = azurerm_virtual_network.main.name
  address_prefixes     = [var.container_apps_subnet_prefix]

  delegation {
    name = "container-apps-delegation"

    service_delegation {
      name = "Microsoft.App/environments"
    }
  }
}
