variable "name_prefix" {
  type = string
}

variable "resource_group_name" {
  type = string
}

variable "location" {
  type = string
}

variable "address_space" {
  type    = list(string)
  default = ["10.90.0.0/16"]
}

variable "container_apps_subnet_prefix" {
  description = "Must be /23 or larger - the Container Apps environment reserves a large IP block per subnet"
  type        = string
  default     = "10.90.0.0/23"
}

variable "tags" {
  type    = map(string)
  default = {}
}
