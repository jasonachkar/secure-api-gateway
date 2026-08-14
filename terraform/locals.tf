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

  additional_cors_origins_normalized = toset([
    for origin in var.additional_cors_origins : trimsuffix(trimspace(origin), "/")
  ])
  static_web_app_origin = var.enable_azure_static_web_app ? trimsuffix(module.static_web_app[0].url, "/") : null
  cors_origins_combined = sort(tolist(setunion(
    local.additional_cors_origins_normalized,
    local.static_web_app_origin == null ? toset([]) : toset([local.static_web_app_origin])
  )))
}

check "static_web_app_origin_is_allowed" {
  assert {
    condition = (
      !var.enable_azure_static_web_app ||
      contains(local.cors_origins_combined, local.static_web_app_origin)
    )
    error_message = "The provisioned Azure Static Web Apps origin must be included in the effective CORS allowlist."
  }
}
