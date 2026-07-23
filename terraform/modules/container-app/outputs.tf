output "fqdn" {
  # Deliberately NOT azurerm_container_app.main.latest_revision_fqdn - that's pinned to
  # whichever revision existed the last time Terraform state was refreshed, so it goes
  # stale the moment you deploy a new image via `az containerapp update` (which is the
  # documented, expected way to ship a new image - see terraform/README.md). This is
  # the stable, revision-independent hostname that always routes to whatever revision
  # currently holds traffic (100% of it, under revision_mode = "Single").
  value = "${azurerm_container_app.main.name}.${azurerm_container_app_environment.main.default_domain}"
}

output "container_app_id" {
  value = azurerm_container_app.main.id
}

output "container_app_name" {
  value = azurerm_container_app.main.name
}

output "environment_id" {
  value = azurerm_container_app_environment.main.id
}

output "identity_principal_id" {
  value = azurerm_user_assigned_identity.gateway.principal_id
}
