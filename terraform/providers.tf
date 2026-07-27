terraform {
  required_version = ">= 1.6.0"

  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 4.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    google = {
      source  = "hashicorp/google"
      version = "~> 6.0"
    }
    time = {
      source  = "hashicorp/time"
      version = "~> 0.12"
    }
  }

  # Configure via `terraform init -backend-config=environments/<env>.backend.hcl`,
  # or copy backend.tf.example to backend.tf and fill in a real storage account.
  # Left unconfigured here so `terraform init` works out of the box with local state
  # for a first try - see terraform/README.md before using this for anything real.
}

provider "azurerm" {
  features {
    key_vault {
      purge_soft_delete_on_destroy    = true
      recover_soft_deleted_key_vaults = true
    }
    resource_group {
      prevent_deletion_if_contains_resources = false
    }
  }
}

# Only touched when enable_aws_cloudwatch_ingestion = true - relies on the ambient AWS
# credential chain (aws configure / env vars / SSO), exactly like azurerm relies on
# `az login` above. No resources are planned from this provider unless that flag is on,
# so it doesn't need working credentials for a default apply.
provider "aws" {
  region = var.aws_region
}

# Only touched when enable_gcp_logging_ingestion = true - relies on Application Default
# Credentials (`gcloud auth application-default login`), same idea as the aws provider.
provider "google" {
  project = var.gcp_project_id
}
