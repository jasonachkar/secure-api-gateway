output "default_host_name" {
  value = azurerm_static_web_app.dashboard.default_host_name
}

output "url" {
  value = "https://${azurerm_static_web_app.dashboard.default_host_name}"
}

output "api_key" {
  description = "Deployment token - add as the GitHub repo secret AZURE_STATIC_WEB_APPS_API_TOKEN"
  value       = azurerm_static_web_app.dashboard.api_key
  sensitive   = true
}
