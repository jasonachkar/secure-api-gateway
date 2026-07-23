/**
 * Container Apps Environment + the gateway Container App itself.
 *
 * Uses a user-assigned managed identity (rather than the app's own system-assigned
 * identity) specifically to avoid a circular dependency: the ACR pull and Key Vault
 * secret role grants have to exist *before* the Container App can start pulling its
 * image or resolving its secrets, but a system-assigned identity's principal ID isn't
 * known until the Container App resource itself is created. A user-assigned identity
 * is a separate resource with a principal ID available up front, so the role
 * assignments below can be created first and the Container App can depend on them.
 */

resource "azurerm_user_assigned_identity" "gateway" {
  name                = "${var.name}-identity"
  resource_group_name = var.resource_group_name
  location            = var.location
  tags                = var.tags
}

resource "azurerm_role_assignment" "acr_pull" {
  scope                = var.acr_id
  role_definition_name = "AcrPull"
  principal_id         = azurerm_user_assigned_identity.gateway.principal_id
}

resource "azurerm_role_assignment" "key_vault_secrets_user" {
  scope                = var.key_vault_id
  role_definition_name = "Key Vault Secrets User"
  principal_id         = azurerm_user_assigned_identity.gateway.principal_id
}

resource "azurerm_container_app_environment" "main" {
  name                       = "${var.name}-env"
  resource_group_name        = var.resource_group_name
  location                   = var.location
  log_analytics_workspace_id = var.log_analytics_workspace_id
  infrastructure_subnet_id   = var.infrastructure_subnet_id

  tags = var.tags
}

resource "azurerm_container_app" "main" {
  name                         = var.name
  resource_group_name          = var.resource_group_name
  container_app_environment_id = azurerm_container_app_environment.main.id
  revision_mode                = "Single"

  identity {
    type         = "UserAssigned"
    identity_ids = [azurerm_user_assigned_identity.gateway.id]
  }

  registry {
    server   = var.acr_login_server
    identity = azurerm_user_assigned_identity.gateway.id
  }

  dynamic "secret" {
    for_each = var.secrets
    content {
      name                = secret.key
      key_vault_secret_id = secret.value
      identity            = azurerm_user_assigned_identity.gateway.id
    }
  }

  template {
    min_replicas = var.min_replicas
    max_replicas = var.max_replicas

    container {
      name   = "gateway"
      image  = var.image
      cpu    = var.cpu
      memory = var.memory

      dynamic "env" {
        for_each = var.env_vars
        content {
          name  = env.key
          value = env.value
        }
      }

      dynamic "env" {
        for_each = var.secret_env_vars
        content {
          name        = env.key
          secret_name = env.value
        }
      }

      # /healthz and /readyz always exist on the placeholder bootstrap image too
      # (it's a simple nginx hello-world), so these probes don't block the first
      # deploy before CI has pushed the real gateway image.
      liveness_probe {
        transport               = "HTTP"
        port                    = var.target_port
        path                    = "/healthz"
        initial_delay           = 10
        interval_seconds        = 30
        failure_count_threshold = 3
      }

      readiness_probe {
        transport               = "HTTP"
        port                    = var.target_port
        path                    = "/readyz"
        interval_seconds        = 10
        failure_count_threshold = 3
      }
    }
  }

  ingress {
    external_enabled = true
    target_port      = var.target_port
    transport        = "auto"

    traffic_weight {
      latest_revision = true
      percentage      = 100
    }
  }

  tags = var.tags

  depends_on = [
    azurerm_role_assignment.acr_pull,
    azurerm_role_assignment.key_vault_secrets_user,
  ]

  lifecycle {
    ignore_changes = [
      # CI updates the running image directly via `az containerapp update` after
      # building and pushing to ACR (see .github/workflows/deploy.yml) - without this,
      # the next `terraform apply` would revert it back to var.image (the bootstrap
      # placeholder or whatever was last in tfvars).
      template[0].container[0].image,
    ]
  }
}
