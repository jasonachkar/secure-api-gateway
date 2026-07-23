variable "name" {
  type = string
}

variable "resource_group_name" {
  type = string
}

variable "location" {
  type = string
}

variable "publisher_name" {
  type = string
}

variable "publisher_email" {
  type = string
}

variable "sku_name" {
  description = "e.g. Developer_1 (~$50/mo, no SLA, for evaluation) or Basic_1/Standard_1/Premium_1 for production. There is no free/consumption tier with policy support suitable for this use case."
  type        = string
  default     = "Developer_1"
}

variable "backend_url" {
  description = "The Container App's HTTPS FQDN to forward requests to"
  type        = string
}

variable "rate_limit_calls" {
  type    = number
  default = 100
}

variable "rate_limit_period_seconds" {
  type    = number
  default = 60
}

variable "cors_allowed_origins" {
  description = "APIM-level CORS allowlist. Defaults to \"*\" for a frictionless demo - override with your real frontend origin(s) for anything beyond local evaluation, the same way CORS_ORIGIN is required to be explicit on the app itself."
  type        = list(string)
  default     = ["*"]
}

variable "tags" {
  type    = map(string)
  default = {}
}
