data "azurerm_client_config" "current" {}

resource "azurerm_resource_group" "main" {
  name     = "rg-${local.name_prefix}"
  location = var.location
  tags     = local.common_tags
}

module "monitoring" {
  source = "./modules/monitoring"

  name_prefix         = local.name_prefix
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  retention_in_days   = var.log_retention_days
  daily_quota_gb      = var.log_analytics_daily_quota_gb
  tags                = local.common_tags
}

module "acr" {
  source = "./modules/acr"

  name                = local.acr_name
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  tags                = local.common_tags
}

module "key_vault" {
  source = "./modules/key-vault"

  name                = local.key_vault_name
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  tenant_id           = data.azurerm_client_config.current.tenant_id
  tags                = local.common_tags
}

# Grants whoever runs `terraform apply` write access to seed secrets - Key Vault is
# RBAC-authorized (not the legacy access-policy model), so this is a real, auditable
# role assignment rather than an implicit "vault creator can always write" exception.
resource "azurerm_role_assignment" "deployer_key_vault_secrets_officer" {
  scope                = module.key_vault.id
  role_definition_name = "Key Vault Secrets Officer"
  principal_id         = data.azurerm_client_config.current.object_id
}

module "redis" {
  count  = var.enable_redis ? 1 : 0
  source = "./modules/redis"

  name                = local.redis_name
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  sku_name            = var.redis_sku_name
  capacity            = var.redis_capacity
  tags                = local.common_tags
}

module "networking" {
  count  = var.enable_vnet ? 1 : 0
  source = "./modules/networking"

  name_prefix         = local.name_prefix
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  tags                = local.common_tags
}

# Generated application secrets. Real, unique values are written to Key Vault as part
# of this apply, so the deployment is fully working immediately - no manual
# `az keyvault secret set` bootstrap step required for the app to start. Rotate by
# tainting the relevant random_password resource and re-applying, or by writing a new
# value directly with `az keyvault secret set` (see terraform/README.md).
resource "random_password" "cookie_secret" {
  length  = 48
  special = false
}

resource "random_password" "jwt_secret" {
  length  = 64
  special = false
}

# Computed once and stored in state (not re-evaluated from timestamp() on every plan),
# so it gives every Key Vault secret a real expiration_date without causing a perpetual
# diff. Rotate by tainting this resource (which forces a new expiry on every secret that
# references it) alongside rotating the secret values themselves.
resource "time_offset" "key_vault_secret_expiry" {
  offset_days = 365
}

resource "azurerm_key_vault_secret" "cookie_secret" {
  name            = "cookie-secret"
  value           = random_password.cookie_secret.result
  key_vault_id    = module.key_vault.id
  content_type    = "text/plain"
  expiration_date = time_offset.key_vault_secret_expiry.rfc3339

  depends_on = [azurerm_role_assignment.deployer_key_vault_secrets_officer]
}

resource "azurerm_key_vault_secret" "jwt_secret" {
  name            = "jwt-secret"
  value           = random_password.jwt_secret.result
  key_vault_id    = module.key_vault.id
  content_type    = "text/plain"
  expiration_date = time_offset.key_vault_secret_expiry.rfc3339

  depends_on = [azurerm_role_assignment.deployer_key_vault_secrets_officer]
}

resource "azurerm_key_vault_secret" "redis_password" {
  count           = var.enable_redis ? 1 : 0
  name            = "redis-password"
  value           = module.redis[0].primary_access_key
  key_vault_id    = module.key_vault.id
  content_type    = "text/plain"
  expiration_date = time_offset.key_vault_secret_expiry.rfc3339

  depends_on = [azurerm_role_assignment.deployer_key_vault_secrets_officer]
}

module "static_web_app" {
  count  = var.enable_azure_static_web_app ? 1 : 0
  source = "./modules/static-web-app"

  name                = local.static_web_app_name
  resource_group_name = azurerm_resource_group.main.name
  location            = var.static_web_app_location
  tags                = local.common_tags
}

module "aws_logging" {
  count  = var.enable_aws_cloudwatch_ingestion ? 1 : 0
  source = "./modules/aws-logging"

  log_group_name     = "/secure-api-gateway/${var.environment}"
  log_retention_days = var.aws_cloudwatch_log_retention_days
  tags               = local.common_tags
}

module "gcp_logging" {
  count  = var.enable_gcp_logging_ingestion ? 1 : 0
  source = "./modules/gcp-logging"

  project_id = var.gcp_project_id
}

resource "azurerm_key_vault_secret" "aws_cloudwatch_access_key_id" {
  count           = var.enable_aws_cloudwatch_ingestion ? 1 : 0
  name            = "aws-cloudwatch-access-key-id"
  value           = module.aws_logging[0].access_key_id
  key_vault_id    = module.key_vault.id
  content_type    = "text/plain"
  expiration_date = time_offset.key_vault_secret_expiry.rfc3339

  depends_on = [azurerm_role_assignment.deployer_key_vault_secrets_officer]
}

resource "azurerm_key_vault_secret" "aws_cloudwatch_secret_access_key" {
  count           = var.enable_aws_cloudwatch_ingestion ? 1 : 0
  name            = "aws-cloudwatch-secret-access-key"
  value           = module.aws_logging[0].secret_access_key
  key_vault_id    = module.key_vault.id
  content_type    = "text/plain"
  expiration_date = time_offset.key_vault_secret_expiry.rfc3339

  depends_on = [azurerm_role_assignment.deployer_key_vault_secrets_officer]
}

resource "azurerm_key_vault_secret" "gcp_logging_credentials" {
  count           = var.enable_gcp_logging_ingestion ? 1 : 0
  name            = "gcp-logging-credentials"
  value           = module.gcp_logging[0].service_account_key_json
  key_vault_id    = module.key_vault.id
  content_type    = "application/json"
  expiration_date = time_offset.key_vault_secret_expiry.rfc3339

  depends_on = [azurerm_role_assignment.deployer_key_vault_secrets_officer]
}

module "container_app" {
  source = "./modules/container-app"

  name                       = "${local.name_prefix}-gateway"
  resource_group_name        = azurerm_resource_group.main.name
  location                   = azurerm_resource_group.main.location
  log_analytics_workspace_id = module.monitoring.log_analytics_workspace_id
  acr_id                     = module.acr.id
  acr_login_server           = module.acr.login_server
  key_vault_id               = module.key_vault.id
  infrastructure_subnet_id   = var.enable_vnet ? module.networking[0].container_apps_subnet_id : null

  image        = var.container_image
  target_port  = 3000
  cpu          = var.container_cpu
  memory       = var.container_memory
  min_replicas = var.container_min_replicas
  max_replicas = var.container_max_replicas

  env_vars = {
    NODE_ENV                              = "production"
    HOST                                  = "0.0.0.0"
    PORT                                  = "3000"
    LOG_LEVEL                             = "info"
    LOG_PRETTY                            = "false"
    JWT_ALGORITHM                         = "HS256"
    JWT_ACCESS_TOKEN_EXPIRES_IN           = "15m"
    JWT_REFRESH_TOKEN_EXPIRES_IN          = "7d"
    CORS_ORIGIN                           = join(",", local.cors_origins_combined)
    ENABLE_SWAGGER                        = "false"
    DEMO_MODE                             = "true"
    UPSTREAM_REPORTS_URL                  = var.upstream_reports_url
    ALLOWED_UPSTREAM_HOSTS                = var.allowed_upstream_hosts
    BODY_LIMIT                            = "1048576"
    REQUEST_TIMEOUT                       = "30000"
    REDIS_HOST                            = var.enable_redis ? module.redis[0].hostname : "localhost"
    REDIS_PORT                            = var.enable_redis ? tostring(module.redis[0].ssl_port) : "6379"
    REDIS_TLS                             = var.enable_redis ? "true" : "false"
    APPLICATIONINSIGHTS_CONNECTION_STRING = module.monitoring.app_insights_connection_string
    CLOUDWATCH_LOG_GROUP                  = var.enable_aws_cloudwatch_ingestion ? module.aws_logging[0].log_group_name : ""
    AWS_REGION                            = var.enable_aws_cloudwatch_ingestion ? var.aws_region : ""
    GCP_LOGGING_PROJECT                   = var.enable_gcp_logging_ingestion ? var.gcp_project_id : ""
  }

  secrets = merge(
    {
      "cookie-secret" = azurerm_key_vault_secret.cookie_secret.versionless_id
      "jwt-secret"    = azurerm_key_vault_secret.jwt_secret.versionless_id
    },
    var.enable_redis ? { "redis-password" = azurerm_key_vault_secret.redis_password[0].versionless_id } : {},
    var.enable_aws_cloudwatch_ingestion ? {
      "aws-cloudwatch-access-key-id"     = azurerm_key_vault_secret.aws_cloudwatch_access_key_id[0].versionless_id
      "aws-cloudwatch-secret-access-key" = azurerm_key_vault_secret.aws_cloudwatch_secret_access_key[0].versionless_id
    } : {},
    var.enable_gcp_logging_ingestion ? {
      "gcp-logging-credentials" = azurerm_key_vault_secret.gcp_logging_credentials[0].versionless_id
    } : {}
  )

  secret_env_vars = merge(
    {
      COOKIE_SECRET = "cookie-secret"
      JWT_SECRET    = "jwt-secret"
    },
    var.enable_redis ? { REDIS_PASSWORD = "redis-password" } : {},
    var.enable_aws_cloudwatch_ingestion ? {
      AWS_ACCESS_KEY_ID     = "aws-cloudwatch-access-key-id"
      AWS_SECRET_ACCESS_KEY = "aws-cloudwatch-secret-access-key"
    } : {},
    var.enable_gcp_logging_ingestion ? {
      GCP_SERVICE_ACCOUNT_KEY = "gcp-logging-credentials"
    } : {}
  )

  tags = local.common_tags
}

module "apim" {
  count  = var.enable_apim ? 1 : 0
  source = "./modules/apim"

  name                 = "${local.name_prefix}-apim"
  resource_group_name  = azurerm_resource_group.main.name
  location             = azurerm_resource_group.main.location
  publisher_name       = var.apim_publisher_name
  publisher_email      = var.apim_publisher_email
  sku_name             = var.apim_sku_name
  backend_url          = "https://${module.container_app.fqdn}"
  cors_allowed_origins = local.cors_origins_combined
  tags                 = local.common_tags
}
