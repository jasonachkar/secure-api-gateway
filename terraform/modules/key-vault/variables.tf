variable "name" {
  description = "Key Vault name - must be globally unique across Azure, 3-24 chars"
  type        = string
}

variable "resource_group_name" {
  type = string
}

variable "location" {
  type = string
}

variable "tenant_id" {
  type = string
}

variable "sku_name" {
  type    = string
  default = "standard"
}

variable "tags" {
  type    = map(string)
  default = {}
}

variable "purge_protection_enabled" {
  description = <<-EOT
    Off by default so a demo/dev vault can be torn down immediately with
    `terraform destroy` instead of lingering in a 7-90 day soft-deleted state that
    blocks reusing the same vault name. Set true for a real production deployment,
    where preventing permanent secret loss outweighs teardown convenience.
  EOT
  type        = bool
  default     = false
}

variable "network_default_action" {
  description = <<-EOT
    "Allow" by default: this reference deployment's Container App reaches Key Vault
    over the public endpoint (no private endpoint / VNet integration wired by
    default - see enable_vnet in the root module). Set "Deny" once VNet integration
    is enabled and allowed_subnet_ids is populated, so only the app's subnet (and
    the trusted Azure services below) can reach the vault.
  EOT
  type        = string
  default     = "Allow"
  validation {
    condition     = contains(["Allow", "Deny"], var.network_default_action)
    error_message = "network_default_action must be \"Allow\" or \"Deny\"."
  }
}

variable "allowed_subnet_ids" {
  description = "Subnet IDs allowed through the network ACL when network_default_action is \"Deny\"."
  type        = list(string)
  default     = []
}
