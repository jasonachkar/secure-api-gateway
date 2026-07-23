resource "random_string" "suffix" {
  length  = 4
  special = false
  upper   = false
}

locals {
  name_prefix = "${var.project_name}-${var.environment}"

  common_tags = merge({
    project     = var.project_name
    environment = var.environment
    managed_by  = "terraform"
  }, var.tags)

  # Azure resource names have tighter, resource-specific constraints (length, allowed
  # characters, global uniqueness) than a plain "<prefix>-thing" - centralize the ones
  # that need it here rather than repeating the logic at each call site.
  acr_name            = lower(substr(replace("${var.project_name}${var.environment}acr${random_string.suffix.result}", "-", ""), 0, 50))
  key_vault_name      = lower(substr("${local.name_prefix}-kv-${random_string.suffix.result}", 0, 24))
  redis_name          = "${local.name_prefix}-redis"
  static_web_app_name = "${local.name_prefix}-dashboard"

  # var.cors_origin is the Vercel (or other) frontend origin set manually; when the
  # Azure Static Web App is also enabled, its URL is known at apply time, so it's
  # folded in automatically instead of requiring a second manual CORS update.
  cors_origins_combined = compact(concat(
    split(",", var.cors_origin),
    var.enable_azure_static_web_app ? [module.static_web_app[0].url] : []
  ))
}
