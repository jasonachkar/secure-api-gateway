variable "name" {
  type = string
}

variable "resource_group_name" {
  type = string
}

variable "location" {
  description = "Azure Static Web Apps is only available in a handful of regions (centralus, eastus2, westus2, westeurope, eastasia at time of writing) - independent of the main deployment's `location`, which usually won't be one of these."
  type        = string
  default     = "eastus2"
}

variable "sku_tier" {
  description = "Free tier includes custom domains, free-managed SSL, 2 staging environments, 100GB/mo bandwidth - no reason to pay for this at portfolio-demo scale"
  type        = string
  default     = "Free"
}

variable "tags" {
  type    = map(string)
  default = {}
}
