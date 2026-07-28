resource "google_cloud_run_domain_mapping" "api" {
  count    = var.enable_custom_domain ? 1 : 0
  location = var.region
  name     = local.api_hostname

  metadata {
    namespace = var.project_id
  }

  spec {
    route_name = google_cloud_run_v2_service.api.name
  }

  depends_on = [google_cloud_run_v2_service.api]
}

resource "google_cloud_run_domain_mapping" "support_hub" {
  count    = var.enable_custom_domain ? 1 : 0
  location = var.region
  name     = local.hub_hostname

  metadata {
    namespace = var.project_id
  }

  spec {
    route_name = google_cloud_run_v2_service.support_hub.name
  }

  depends_on = [google_cloud_run_v2_service.support_hub]
}

resource "google_cloud_run_domain_mapping" "review_console" {
  count    = var.enable_custom_domain ? 1 : 0
  location = var.region
  name     = local.console_hostname

  metadata {
    namespace = var.project_id
  }

  spec {
    route_name = google_cloud_run_v2_service.review_console.name
  }

  depends_on = [google_cloud_run_v2_service.review_console]
}
