output "resource_group_name" {
  value = azurerm_resource_group.main.name
}

output "acr_login_server" {
  value = module.acr.login_server
}

output "key_vault_name" {
  value = module.key_vault.name
}

output "key_vault_uri" {
  value = module.key_vault.uri
}

output "container_app_url" {
  description = "Public HTTPS URL of the deployed gateway"
  value       = "https://${module.container_app.fqdn}"
}

output "container_app_name" {
  value = module.container_app.container_app_name
}

output "redis_hostname" {
  value = var.enable_redis ? module.redis[0].hostname : null
}

output "apim_gateway_url" {
  value = var.enable_apim ? module.apim[0].gateway_url : null
}

output "log_analytics_workspace_name" {
  value = module.monitoring.log_analytics_workspace_name
}

output "static_web_app_url" {
  description = "Public HTTPS URL of the Azure Static Web App (null unless enable_azure_static_web_app = true)"
  value       = var.enable_azure_static_web_app ? module.static_web_app[0].url : null
}

output "static_web_app_deployment_token" {
  description = "Add this as the GitHub repo secret AZURE_STATIC_WEB_APPS_API_TOKEN (terraform output -raw static_web_app_deployment_token)"
  value       = var.enable_azure_static_web_app ? module.static_web_app[0].api_key : null
  sensitive   = true
}

output "next_steps" {
  description = "Printed reminder of what to do after `terraform apply` - see terraform/README.md for the full walkthrough"
  value = join("\n", concat(
    [
      "1. Build and push the real gateway image: docker build -t ${module.acr.login_server}/secure-api-gateway:latest . && az acr login --name ${module.acr.name} && docker push ${module.acr.login_server}/secure-api-gateway:latest",
      "2. Point the Container App at it: az containerapp update -n ${module.container_app.container_app_name} -g ${azurerm_resource_group.main.name} --image ${module.acr.login_server}/secure-api-gateway:latest",
      "3. Seed any optional secrets (e.g. ABUSEIPDB_API_KEY) with: az keyvault secret set --vault-name ${module.key_vault.name} --name <name> --value <value>",
      "4. Verify: curl https://${module.container_app.fqdn}/healthz",
    ],
    var.enable_azure_static_web_app ? [
      "5. GitHub repo Settings -> Secrets -> Actions: add AZURE_STATIC_WEB_APPS_API_TOKEN = $(terraform output -raw static_web_app_deployment_token)",
      "6. GitHub repo Settings -> Variables -> Actions: add VITE_API_URL = https://${module.container_app.fqdn}",
      "7. Push to main (or re-run the deploy-dashboard workflow) to trigger the first dashboard deploy",
    ] : []
  ))
}
