/**
 * Optional Azure API Management front door (var.enable_apim at the root - false by
 * default). Even the cheapest SKU with policy support (Developer, no SLA) runs
 * ~$50+/mo and takes 30-45 minutes to provision, so this is deliberately not part of
 * the default path. What it buys you: WAF-style request filtering, a rate limit
 * enforced before traffic ever reaches the Container App, subscription-key auth as an
 * additional layer, and a place to attach further policies (IP allowlisting, JWT
 * validation at the edge, etc). The Container App remains directly reachable either
 * way in this module - see docs/ARCHITECTURE.md for the trust-boundary implications
 * of that and how to lock it down further.
 */

resource "azurerm_api_management" "main" {
  name                = var.name
  resource_group_name = var.resource_group_name
  location            = var.location
  publisher_name      = var.publisher_name
  publisher_email     = var.publisher_email
  sku_name            = var.sku_name
  tags                = var.tags
}

resource "azurerm_api_management_backend" "gateway" {
  name                = "gateway-backend"
  resource_group_name = var.resource_group_name
  api_management_name = azurerm_api_management.main.name
  protocol            = "http"
  url                 = var.backend_url
}

resource "azurerm_api_management_api" "gateway" {
  name                  = "gateway-api"
  resource_group_name   = var.resource_group_name
  api_management_name   = azurerm_api_management.main.name
  revision              = "1"
  display_name          = "Secure API Gateway"
  path                  = ""
  protocols             = ["https"]
  subscription_required = true
}

# A handful of representative passthrough operations - APIM requires operations to be
# declared (it isn't a transparent proxy by default), so this forwards the common verbs
# for any path. Add explicit operations with request/response schemas here if you want
# APIM to validate payloads at the edge instead of just forwarding them.
resource "azurerm_api_management_api_operation" "passthrough" {
  for_each = toset(["GET", "POST", "PUT", "DELETE", "PATCH"])

  operation_id        = "passthrough-${lower(each.value)}"
  api_name            = azurerm_api_management_api.gateway.name
  api_management_name = azurerm_api_management.main.name
  resource_group_name = var.resource_group_name
  display_name        = "Passthrough ${each.value}"
  method              = each.value
  url_template        = "/*"
}

# Example threat-filtering policy: route to the backend, enforce a rate limit at the
# edge (in addition to the app's own Redis-backed limiting), apply CORS, and strip
# server-identifying response headers. Starting point, not a complete policy set -
# see docs/SECURITY_CONTROLS.md for what else to layer on (JWT validation at the edge,
# IP allowlisting, request size limits, etc).
resource "azurerm_api_management_api_policy" "gateway" {
  api_name            = azurerm_api_management_api.gateway.name
  api_management_name = azurerm_api_management.main.name
  resource_group_name = var.resource_group_name

  xml_content = <<XML
<policies>
  <inbound>
    <base />
    <set-backend-service backend-id="${azurerm_api_management_backend.gateway.name}" />
    <rate-limit calls="${var.rate_limit_calls}" renewal-period="${var.rate_limit_period_seconds}" />
    <cors allow-credentials="true">
      <allowed-origins>
        %{for origin in var.cors_allowed_origins~}
        <origin>${origin}</origin>
        %{endfor~}
      </allowed-origins>
      <allowed-methods>
        <method>GET</method>
        <method>POST</method>
        <method>PUT</method>
        <method>DELETE</method>
        <method>PATCH</method>
      </allowed-methods>
      <allowed-headers>
        <header>*</header>
      </allowed-headers>
    </cors>
  </inbound>
  <backend>
    <base />
  </backend>
  <outbound>
    <base />
    <set-header name="X-Powered-By" exists-action="delete" />
    <set-header name="Server" exists-action="delete" />
  </outbound>
  <on-error>
    <base />
  </on-error>
</policies>
XML
}
