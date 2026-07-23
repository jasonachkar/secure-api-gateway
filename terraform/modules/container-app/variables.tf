variable "name" {
  type = string
}

variable "resource_group_name" {
  type = string
}

variable "location" {
  type = string
}

variable "log_analytics_workspace_id" {
  type = string
}

variable "acr_id" {
  type = string
}

variable "acr_login_server" {
  type = string
}

variable "key_vault_id" {
  type = string
}

variable "infrastructure_subnet_id" {
  description = "Optional - only set when the Container Apps environment should be VNet-integrated (var.enable_vnet at the root)"
  type        = string
  default     = null
}

variable "image" {
  description = "Full container image reference (e.g. myacr.azurecr.io/gateway:latest). Defaults to a public placeholder so the very first apply succeeds before CI has pushed a real image; the image field is then updated out-of-band by CI and Terraform is told to ignore drift on it (see the lifecycle block in main.tf)."
  type        = string
}

variable "target_port" {
  type    = number
  default = 3000
}

variable "cpu" {
  description = "vCPU cores. Container Apps requires memory to scale with cpu in fixed combinations (e.g. 0.5 cpu -> 1Gi memory)."
  type        = number
  default     = 0.5
}

variable "memory" {
  type    = string
  default = "1Gi"
}

variable "min_replicas" {
  description = "0 allows scale-to-zero, which is what keeps this within the Container Apps consumption free grant when idle"
  type        = number
  default     = 0
}

variable "max_replicas" {
  type    = number
  default = 3
}

variable "env_vars" {
  description = "Plain (non-secret) environment variables"
  type        = map(string)
  default     = {}
}

variable "secrets" {
  description = "Map of secret name -> Key Vault secret resource ID. Surfaced to the container only via secret_env_vars."
  type        = map(string)
  default     = {}
}

variable "secret_env_vars" {
  description = "Map of container env var name -> secret name (the secret name must be a key in var.secrets)"
  type        = map(string)
  default     = {}
}

variable "tags" {
  type    = map(string)
  default = {}
}
