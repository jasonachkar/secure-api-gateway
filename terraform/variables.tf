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

variable "additional_cors_origins" {
  description = "Optional HTTPS origins for custom dashboard domains. The provisioned Azure Static Web Apps origin is included automatically."
  type        = set(string)
  default     = []

  validation {
    condition = alltrue([
      for origin in var.additional_cors_origins :
      !strcontains(origin, "*") && can(regex("^https://[A-Za-z0-9.-]+(:[0-9]+)?/?$", trimspace(origin)))
    ])
    error_message = "additional_cors_origins must contain HTTPS origins only, without wildcards, credentials, paths, queries, or fragments."
  }
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
  description = "Provision Azure Static Web Apps as the default dashboard host. Free tier, custom domains, and SSL are included."
  type        = bool
  default     = true
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

variable "enable_aws_cloudwatch_ingestion" {
  description = "Provision a dedicated AWS CloudWatch Logs log group plus a least-privilege IAM reader, and wire real credentials into the gateway so its CloudWatch ingestion adapter actually polls it. Free at demo scale (well under CloudWatch Logs' 5GB/mo free tier) - the real cost is operational: a second cloud credential (a static IAM access key) to manage. Requires AWS credentials available to Terraform at apply time (aws configure / env vars / SSO). See terraform/modules/aws-logging and terraform/README.md."
  type        = bool
  default     = false
}

variable "aws_region" {
  type    = string
  default = "us-east-1"
}

variable "aws_profile" {
  description = "AWS CLI profile to use for provisioning the CloudWatch log group and IAM reader. Only required if enable_aws_cloudwatch_ingestion = true."
  type        = string
  default     = "default"
}

variable "aws_cloudwatch_log_retention_days" {
  type    = number
  default = 14
}

variable "enable_gcp_logging_ingestion" {
  description = "Provision a read-only (roles/logging.viewer) GCP service account in an existing project, and wire real credentials into the gateway so its GCP Logging ingestion adapter actually polls it. No log source needs provisioning - every GCP project already captures activity/audit logs. Free at demo scale (well under Cloud Logging's 50GiB/mo free tier) - the real cost is operational: a third cloud credential (a service account key) to manage. Requires GCP Application Default Credentials available to Terraform at apply time (gcloud auth application-default login). See terraform/modules/gcp-logging and terraform/README.md."
  type        = bool
  default     = false
}

variable "gcp_project_id" {
  description = "Existing GCP project to read Cloud Logging entries from. Required only if enable_gcp_logging_ingestion = true."
  type        = string
  default     = null
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
