variable "name" {
  description = "ACR name - must be globally unique across Azure, alphanumeric only"
  type        = string
}

variable "resource_group_name" {
  type = string
}

variable "location" {
  type = string
}

variable "sku" {
  description = "Basic is the cheapest SKU (~$0.167/day) and is sufficient for a single low-traffic app"
  type        = string
  default     = "Basic"
}

variable "tags" {
  type    = map(string)
  default = {}
}
