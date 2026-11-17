locals {
  messaging = jsondecode(file("${path.module}/../../../../messaging.json"))
  platform  = data.terraform_remote_state.platform.outputs.service_platform
  run_url   = { for s in ["catalog", "ordering", "inventory", "payment", "fulfillment", "notification"] : s => "https://lagoski-${var.environment}-${s}-${data.terraform_remote_state.platform.outputs.project_number}.${var.region}.run.app" }

  labels = {
    project     = "lagoski"
    service     = "bff"
    environment = var.environment
    managed_by  = "terraform"
  }
}

data "terraform_remote_state" "platform" {
  backend = "gcs"
  config = {
    bucket = var.platform_state_bucket
    prefix = "lagoski-platform/gcp/${var.environment}"
  }
}

module "service" {
  source = "../../../modules/gcp-service"

  project_id      = var.project_id
  region          = var.region
  service_name    = "bff"
  prefix          = "lagoski-${var.environment}"
  image           = var.image
  container_port  = 8080
  uses_database   = false
  publishes_topic = local.messaging.publishes
  subscriptions   = local.messaging.subscriptions
  public          = true
  vpc_egress      = "ALL_TRAFFIC"
  # O BFF usa a conta criada pela plataforma: os outros serviços já a autorizam.
  runtime_service_account_email = local.platform.bff_service_account_email

  environment = {
    CATALOG_URL      = local.run_url["catalog"]
    ORDERING_URL     = local.run_url["ordering"]
    INVENTORY_URL    = local.run_url["inventory"]
    PAYMENT_URL      = local.run_url["payment"]
    FULFILLMENT_URL  = local.run_url["fulfillment"]
    NOTIFICATION_URL = local.run_url["notification"]
    CORS_ORIGINS     = var.cors_origins
    UPSTREAM_AUTH    = "gcp-id-token"
  }

  platform = local.platform
  labels   = local.labels
}
