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
