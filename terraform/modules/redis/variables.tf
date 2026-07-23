variable "name" {
  type = string
}

variable "resource_group_name" {
  type = string
}

variable "location" {
  type = string
}

variable "sku_name" {
  description = "Basic has no SLA and no replication - acceptable for a demo/portfolio deployment, not for real production traffic (use Standard or Premium there)"
  type        = string
  default     = "Basic"
}

variable "capacity" {
  description = "0 = C0 (250MB, smallest/cheapest Basic size)"
  type        = number
  default     = 0
}

variable "tags" {
  type    = map(string)
  default = {}
}
