locals {
  # Fonte única: o mesmo arquivo que o código lê na subida.
  messaging = jsondecode(file("${path.module}/../../../../messaging.json"))
  platform  = data.terraform_remote_state.platform.outputs.service_platform

  tags = {
    project     = "lagoski"
    service     = "bff"
    environment = var.environment
    repository  = "wesleyplago/lagoski-bff"
    managed_by  = "terraform"
  }
}

data "terraform_remote_state" "platform" {
  backend = "s3"
  config = {
    bucket = var.platform_state_bucket
    key    = "lagoski-platform/aws/${var.environment}/terraform.tfstate"
    region = var.region
  }
}

module "service" {
  source = "../../../modules/aws-service"

  service_name    = "bff"
  prefix          = "lagoski-${var.environment}"
  image           = var.image
  container_port  = 8080
  uses_database   = false
  publishes_topic = local.messaging.publishes
  subscriptions   = local.messaging.subscriptions
  public          = true

  environment = {
    CATALOG_URL      = "http://catalog.${local.platform.service_discovery_domain}:8081"
    ORDERING_URL     = "http://ordering.${local.platform.service_discovery_domain}:8082"
    INVENTORY_URL    = "http://inventory.${local.platform.service_discovery_domain}:8083"
    PAYMENT_URL      = "http://payment.${local.platform.service_discovery_domain}:8084"
    FULFILLMENT_URL  = "http://fulfillment.${local.platform.service_discovery_domain}:8085"
    NOTIFICATION_URL = "http://notification.${local.platform.service_discovery_domain}:8086"
    CORS_ORIGINS     = var.cors_origins
  }

  platform = local.platform
  tags     = local.tags
}
