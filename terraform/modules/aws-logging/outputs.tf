output "log_group_name" {
  value = aws_cloudwatch_log_group.this.name
}

output "access_key_id" {
  value = aws_iam_access_key.reader.id
}

output "secret_access_key" {
  description = "Add to Key Vault as aws-cloudwatch-secret-access-key - see terraform/README.md"
  value       = aws_iam_access_key.reader.secret
  sensitive   = true
}
