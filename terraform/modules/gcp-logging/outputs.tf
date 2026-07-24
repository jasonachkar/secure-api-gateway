output "project_id" {
  value = var.project_id
}

output "service_account_key_json" {
  description = "Decoded (raw JSON, not base64) service account key - add to Key Vault as gcp-logging-credentials, see terraform/README.md"
  value       = base64decode(google_service_account_key.reader.private_key)
  sensitive   = true
}
