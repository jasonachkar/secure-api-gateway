/**
 * AWS CloudWatch Logs source for the ingestion pipeline (var.enable_aws_cloudwatch_ingestion
 * at the root, false by default). Creates a dedicated log group plus a least-privilege
 * IAM user scoped to reading only that one log group - never a broader CloudWatch/IAM
 * grant.
 *
 * Note: aws_iam_access_key generates a real, usable secret access key and stores it in
 * Terraform state in plaintext. That's a known, unavoidable tradeoff of provisioning
 * long-lived static credentials this way - the same tradeoff this repo already accepts
 * for the Azure-side `random_password` secrets, which also live in state. Protect state
 * accordingly (see terraform/README.md#remote-state).
 */

resource "aws_cloudwatch_log_group" "this" {
  name              = var.log_group_name
  retention_in_days = var.log_retention_days

  tags = var.tags
}

resource "aws_iam_user" "reader" {
  name = "${var.log_group_name}-reader"
  tags = var.tags
}

resource "aws_iam_access_key" "reader" {
  user = aws_iam_user.reader.name
}

resource "aws_iam_user_policy" "reader" {
  name = "cloudwatch-logs-read-only"
  user = aws_iam_user.reader.name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["logs:FilterLogEvents", "logs:DescribeLogGroups"]
        Resource = "${aws_cloudwatch_log_group.this.arn}:*"
      }
    ]
  })
}
