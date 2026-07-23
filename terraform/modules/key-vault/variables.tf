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
