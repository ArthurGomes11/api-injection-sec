terraform {
  required_version = ">= 1.5.0"

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
}

provider "azurerm" {
  features {
      resource_group{
        prevent_deletion_if_contains_resources = false
  }
  }

  subscription_id = var.subscription_id
}

resource "random_string" "suffix" {
  length  = 6
  lower   = true
  upper   = false
  numeric = true
  special = false
}

locals {
  name_suffix          = random_string.suffix.result
  resource_group_name  = "${var.project_name}-${var.environment}-rg"
  service_plan_name    = "${var.project_name}-${var.environment}-plan"
  web_app_name         = "${var.project_name}-${var.environment}-${local.name_suffix}"
  container_registry   = replace("${var.project_name}${var.environment}${local.name_suffix}", "-", "")
  container_image_name = "${var.container_image_name}:${var.container_image_tag}"
}

resource "azurerm_resource_group" "main" {
  name     = local.resource_group_name
  location = var.location
}

resource "azurerm_container_registry" "main" {
  name                = local.container_registry
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  sku                 = "Basic"
  admin_enabled       = true
}

resource "azurerm_service_plan" "main" {
  name                = local.service_plan_name
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  os_type             = "Linux"
  sku_name            = var.app_service_sku
}

resource "azurerm_linux_web_app" "main" {
  name                = local.web_app_name
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  service_plan_id     = azurerm_service_plan.main.id
  https_only          = true

  identity {
    type = "SystemAssigned"
  }

  site_config {
    container_registry_use_managed_identity = true

    application_stack {
      docker_image_name   = local.container_image_name
      docker_registry_url = "https://${azurerm_container_registry.main.login_server}"
    }

    always_on = true
  }

  app_settings = {
    WEBSITES_PORT                       = "3000"
    PORT                                = "3000"
    NODE_ENV                            = "production"
    MONGO_URI                           = var.mongo_uri
    JWT_SECRET                          = var.jwt_secret
    JWT_EXPIRES_IN                      = var.jwt_expires_in
    # Só envia ALLOWED_ORIGIN quando configurado; string vazia omite a variável
    # evitando falha na validação Zod (z.string().url() rejeita string vazia).
    ALLOWED_ORIGIN                      = var.allowed_origin != "" ? var.allowed_origin : null
    WEBSITES_ENABLE_APP_SERVICE_STORAGE = "false"
  }
}

resource "azurerm_role_assignment" "web_app_acr_pull" {
  scope                = azurerm_container_registry.main.id
  role_definition_name = "AcrPull"
  principal_id         = azurerm_linux_web_app.main.identity[0].principal_id
}
