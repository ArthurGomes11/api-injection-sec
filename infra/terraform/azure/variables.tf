variable "subscription_id" {
  description = "ID da subscription Azure onde os recursos serao criados"
  type        = string
}

variable "project_name" {
  description = "Prefixo de nomes de recursos"
  type        = string
  default     = "apiinjection"
}

variable "environment" {
  description = "Ambiente (ex: dev, staging, prod)"
  type        = string
  default     = "dev"
}

variable "location" {
  description = "Regiao Azure"
  type        = string
  default     = "Brazil South"
}

variable "app_service_sku" {
  description = "SKU do App Service Plan Linux"
  type        = string
  default     = "B1"
}

variable "container_image_name" {
  description = "Nome da imagem no ACR"
  type        = string
  default     = "api-injection-test"
}

variable "container_image_tag" {
  description = "Tag da imagem Docker"
  type        = string
  default     = "v1"
}

variable "mongo_uri" {
  description = "String de conexao MongoDB"
  type        = string
  sensitive   = true
}

variable "jwt_secret" {
  description = "Segredo JWT da aplicacao"
  type        = string
  sensitive   = true
}

variable "jwt_expires_in" {
  description = "Duracao do token JWT"
  type        = string
  default     = "1d"
}

variable "allowed_origin" {
  description = "Origem permitida nas requisicoes CORS em producao (ex: https://meusite.com). Deixe vazio para bloquear CORS externo."
  type        = string
  default     = ""
}
