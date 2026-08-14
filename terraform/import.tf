# These resources were created by an earlier apply that didn't make it into this
# environment's remote state (see `key` in backend.tf), so a fresh plan tries to
# create them again and fails with "already exists". Each import block below claims
# the existing cloud resource into state instead. Once a target address is already
# tracked in state, Terraform treats the import as a no-op, so these are safe to
# leave here permanently rather than deleting them after the one-time import.
#
# Scoped to environment == "dev": that's the only environment where these specific
# resources are known to already exist. Import blocks error ("Cannot import
# non-existent remote object") rather than falling back to create, so leaving these
# unconditional would break the first `plan`/`apply` for any other environment
# (e.g. prod) before its own resource group/log group/etc. have ever been created.

locals {
  # Shared prefix for every Azure resource ID below - all of them live in this one
  # resource group.
  dev_rg_id = "/subscriptions/${data.azurerm_client_config.current.subscription_id}/resourceGroups/rg-${local.name_prefix}"
}

import {
  for_each = var.environment == "dev" ? [1] : []
  to       = azurerm_resource_group.main
  id       = local.dev_rg_id
}

import {
  for_each = var.environment == "dev" ? [1] : []
  to       = module.container_app.azurerm_user_assigned_identity.gateway
  id       = "${local.dev_rg_id}/providers/Microsoft.ManagedIdentity/userAssignedIdentities/${local.name_prefix}-gateway-identity"
}

import {
  for_each = var.environment == "dev" ? [1] : []
  to       = module.monitoring.azurerm_log_analytics_workspace.main
  id       = "${local.dev_rg_id}/providers/Microsoft.OperationalInsights/workspaces/${local.name_prefix}-law"
}

import {
  for_each = var.environment == "dev" ? [1] : []
  to       = module.monitoring.azurerm_application_insights.main
  id       = "${local.dev_rg_id}/providers/Microsoft.Insights/components/${local.name_prefix}-appi"
}

import {
  for_each = var.environment == "dev" ? [1] : []
  to       = module.container_app.azurerm_container_app_environment.main
  id       = "${local.dev_rg_id}/providers/Microsoft.App/managedEnvironments/${local.name_prefix}-gateway-env"
}

import {
  for_each = var.environment == "dev" ? [1] : []
  to       = module.container_app.azurerm_container_app.main
  id       = "${local.dev_rg_id}/providers/Microsoft.App/containerApps/${local.name_prefix}-gateway"
}

import {
  for_each = var.environment == "dev" && var.enable_redis ? [1] : []
  to       = module.redis[0].azurerm_redis_cache.main
  id       = "${local.dev_rg_id}/providers/Microsoft.Cache/redis/${local.name_prefix}-redis"
}

import {
  for_each = var.environment == "dev" && var.enable_aws_cloudwatch_ingestion ? [1] : []
  to       = module.aws_logging[0].aws_cloudwatch_log_group.this
  id       = "/secure-api-gateway/${var.environment}"
}

import {
  for_each = var.environment == "dev" && var.enable_aws_cloudwatch_ingestion ? [1] : []
  to       = module.aws_logging[0].aws_iam_user.reader
  id       = "${replace(trim("/secure-api-gateway/${var.environment}", "/"), "/", "-")}-reader"
}

import {
  for_each = var.environment == "dev" && var.enable_gcp_logging_ingestion ? [1] : []
  to       = module.gcp_logging[0].google_service_account.reader
  id       = "projects/${var.gcp_project_id}/serviceAccounts/ingestion-log-reader@${var.gcp_project_id}.iam.gserviceaccount.com"
}
