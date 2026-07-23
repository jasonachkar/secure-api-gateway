variable "name_prefix" {
  description = "Prefix used for resource names"
  type        = string
}

variable "resource_group_name" {
  type = string
}

variable "location" {
  type = string
}

variable "retention_in_days" {
  description = "Log Analytics data retention"
  type        = number
  default     = 30
}

variable "daily_quota_gb" {
  description = "Daily ingestion cap in GB for Log Analytics (-1 disables the cap). Keeping this low bounds cost on a workspace that would otherwise bill per-GB-ingested."
  type        = number
  default     = 1
}

variable "app_insights_daily_cap_gb" {
  description = "Daily ingestion cap in GB for Application Insights"
  type        = number
  default     = 1
}

variable "tags" {
  type    = map(string)
  default = {}
}
