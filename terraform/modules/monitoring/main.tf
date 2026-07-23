/**
 * Log Analytics workspace + Application Insights.
 * Both support the free/low-cost tier: Log Analytics' first 5GB/month is free,
 * and the daily_quota_gb caps below stop either from running away in cost if
 * something starts logging far more than expected.
 */

resource "azurerm_log_analytics_workspace" "main" {
  name                = "${var.name_prefix}-law"
  resource_group_name = var.resource_group_name
  location            = var.location
  sku                 = "PerGB2018"
  retention_in_days   = var.retention_in_days
  daily_quota_gb      = var.daily_quota_gb
  tags                = var.tags
}

resource "azurerm_application_insights" "main" {
  name                 = "${var.name_prefix}-appi"
  resource_group_name  = var.resource_group_name
  location             = var.location
  application_type     = "Node.JS"
  workspace_id         = azurerm_log_analytics_workspace.main.id
  daily_data_cap_in_gb = var.app_insights_daily_cap_gb
  retention_in_days    = var.retention_in_days
  tags                 = var.tags
}
