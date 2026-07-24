/**
 * GCP Cloud Logging source for the ingestion pipeline (var.enable_gcp_logging_ingestion
 * at the root, false by default). Every GCP project already has a default log sink
 * capturing activity/audit logs, so no log source needs to be provisioned - only a
 * read-only service account. GCP IAM has no log-name-scoped grain the way AWS ARNs do;
 * `roles/logging.viewer` at the project level is the finest read-only grain available.
 *
 * Note: google_service_account_key generates a real, usable JSON key and stores it in
 * Terraform state in plaintext - the same known tradeoff as the AWS access key in
 * modules/aws-logging (and this repo's existing Azure-side generated secrets). Protect
 * state accordingly (see terraform/README.md#remote-state).
 */

resource "google_project_service" "logging" {
  project            = var.project_id
  service            = "logging.googleapis.com"
  disable_on_destroy = false # don't disable the API project-wide just because this module is torn down
}

resource "google_service_account" "reader" {
  project      = var.project_id
  account_id   = "ingestion-log-reader"
  display_name = "Secure API Gateway - ingestion log reader (read-only)"

  depends_on = [google_project_service.logging]
}

resource "google_project_iam_member" "reader" {
  project = var.project_id
  role    = "roles/logging.viewer"
  member  = "serviceAccount:${google_service_account.reader.email}"
}

resource "google_service_account_key" "reader" {
  service_account_id = google_service_account.reader.name
}
