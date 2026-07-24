variable "log_group_name" {
  type = string
}

variable "log_retention_days" {
  description = "Caps CloudWatch Logs storage cost - free tier covers 5GB ingestion + storage/month, well above what a demo log group needs"
  type        = number
  default     = 14
}

variable "tags" {
  type    = map(string)
  default = {}
}
