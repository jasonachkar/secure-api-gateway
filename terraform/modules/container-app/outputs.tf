output "fqdn" {
  value = azurerm_container_app.main.latest_revision_fqdn
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
