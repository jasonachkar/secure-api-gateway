variable "project_name" {
  description = "Short project name used as a prefix for resource names (lowercase alphanumeric, no spaces)"
  type        = string
  default     = "secapigw"
}

variable "environment" {
  description = "Deployment environment - used in naming and tagging"
  type        = string
  default     = "dev"

  validation {
    condition     = contains(["dev", "prod"], var.environment)
    error_message = "environment must be \"dev\" or \"prod\"."
  }
}

variable "location" {
  description = "Azure region"
  type        = string
  default     = "eastus"
}

# ── Container App ────────────────────────────────────────────────────────────

variable "container_image" {
  description = "Full container image reference for the gateway (e.g. <acr-login-server>/secure-api-gateway:latest). Defaults to a public placeholder image so the first `terraform apply` succeeds before CI has pushed a real image to ACR - see .github/workflows/deploy.yml, which updates the running image out-of-band afterward. Terraform is configured (lifecycle.ignore_changes) not to fight that update on later applies."
  type        = string
  default     = "mcr.microsoft.com/azuredocs/containerapps-helloworld:latest"
}

variable "container_cpu" {
  description = "vCPU cores - must pair with container_memory in one of Container Apps' fixed combinations (0.25/0.5Gi, 0.5/1Gi, 0.75/1.5Gi, 1/2Gi, ...)"
  type        = number
  default     = 0.5
}

variable "container_memory" {
  type    = string
  default = "1Gi"
}

variable "container_min_replicas" {
  description = "0 allows scale-to-zero when idle, keeping this within the Container Apps consumption free grant"
  type        = number
  default     = 0
}

variable "container_max_replicas" {
  type    = number
  default = 3
}

variable "cors_origin" {
  description = "Comma-separated allowlist for the app's own CORS_ORIGIN env var - set this to your Vercel dashboard URL(s). Never left as \"*\"; the app refuses to boot in production with a wildcard."
  type        = string
  default     = "https://localhost:5173"
}

variable "upstream_reports_url" {
  description = "UPSTREAM_REPORTS_URL for the deployed gateway - point at wherever the mock/real upstream service lives"
  type        = string
  default     = "http://mock-service:4000"
}

variable "allowed_upstream_hosts" {
  description = "ALLOWED_UPSTREAM_HOSTS allowlist for the deployed gateway"
  type        = string
  default     = "mock-service,api.example.com"
}

# ── Redis ─────────────────────────────────────────────────────────────────────

variable "enable_redis" {
  description = "Provision Azure Cache for Redis (Basic C0). This is the one component in this stack with a real, unavoidable monthly cost (~$16/mo) - see terraform/README.md for the full cost table. Disable for a $0-at-rest deployment; the app documents a degraded local-fallback mode without Redis in docs/OPERATIONS.md."
  type        = bool
  default     = true
}

variable "redis_sku_name" {
  type    = string
  default = "Basic"
}

variable "redis_capacity" {
  description = "0 = C0, the smallest/cheapest Basic size"
  type        = number
  default     = 0
}

# ── Optional advanced modules (both false by default) ─────────────────────────

variable "enable_apim" {
  description = "Provision Azure API Management in front of the Container App. Optional advanced path - the cheapest SKU with policy support (Developer) still runs ~$50+/mo with no SLA. See terraform/modules/apim and docs/ARCHITECTURE.md before enabling."
  type        = bool
  default     = false
}

variable "apim_publisher_name" {
  type    = string
  default = "Secure API Gateway"
}

variable "apim_publisher_email" {
  type    = string
  default = "admin@example.com"
}

variable "apim_sku_name" {
  type    = string
  default = "Developer_1"
}

variable "enable_azure_static_web_app" {
  description = "Provision Azure Static Web Apps for the dashboard instead of (or in addition to) deploying it to Vercel. Free tier, custom domains + SSL included. See terraform/README.md#frontend-hosting-vercel-vs-azure-static-web-apps for the manual GitHub setup this still requires (a deployment token as a repo secret, and the backend URL as a repo variable)."
  type        = bool
  default     = false
}

variable "static_web_app_location" {
  description = "Static Web Apps is only available in a handful of regions, independent of `location`"
  type        = string
  default     = "eastus2"
}

variable "enable_vnet" {
  description = "Provision a VNet and integrate the Container Apps environment with it. Optional - the default path is public ingress with no private networking, which keeps this realistic as a low-cost/free-tier portfolio deployment. Enabling this demonstrates the more locked-down topology in docs/ARCHITECTURE.md."
  type        = bool
  default     = false
}

# ── Monitoring ──────────────────────────────────────────────────────────────

variable "log_retention_days" {
  type    = number
  default = 30
}

variable "log_analytics_daily_quota_gb" {
  description = "Caps Log Analytics ingestion cost. Log Analytics bills per GB ingested beyond the first 5GB/month free grant; this keeps a misbehaving log source from running up a bill."
  type        = number
  default     = 1
}

variable "tags" {
  description = "Extra tags merged onto every resource, on top of project/environment/managed_by"
  type        = map(string)
  default     = {}
}
