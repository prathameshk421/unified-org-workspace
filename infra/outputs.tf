output "project_id" {
  value = var.project_id
}

output "region" {
  value = var.region
}

output "artifact_registry_repository" {
  value = google_artifact_registry_repository.main.name
}

output "artifact_registry_url" {
  value = "${local.artifact_registry_location}-docker.pkg.dev/${var.project_id}/${var.artifact_registry_repo}"
}

output "image_repository" {
  description = "Base path for container images in Artifact Registry"
  value       = local.image_base
}

output "cloud_sql_connection_name" {
  value = google_sql_database_instance.postgres.connection_name
}

output "redis_host" {
  value = google_redis_instance.main.host
}

output "api_url" {
  description = "Public API URL (custom domain or Cloud Run default)"
  value       = var.enable_custom_domain ? "https://${local.api_hostname}" : google_cloud_run_v2_service.api.uri
}

output "support_hub_url" {
  description = "Public Support Hub URL (custom domain or Cloud Run default)"
  value       = var.enable_custom_domain ? "https://${local.hub_hostname}" : google_cloud_run_v2_service.support_hub.uri
}

output "review_console_url" {
  description = "Public Review Console URL (custom domain or Cloud Run default)"
  value       = var.enable_custom_domain ? "https://${local.console_hostname}" : google_cloud_run_v2_service.review_console.uri
}

output "gateway_url" {
  description = "Public gateway URL (single hostname for Hub↔Console session sync)"
  value       = google_cloud_run_v2_service.gateway.uri
}

output "cloud_run_urls" {
  description = "Default Cloud Run URLs (use these for GitHub Actions when enable_custom_domain = false)"
  value = {
    api            = google_cloud_run_v2_service.api.uri
    support_hub    = google_cloud_run_v2_service.support_hub.uri
    review_console = google_cloud_run_v2_service.review_console.uri
    gateway        = google_cloud_run_v2_service.gateway.uri
  }
}

output "cookie_domain" {
  value = local.cookie_domain
}

output "github_deploy_service_account" {
  value = google_service_account.github_deploy.email
}

output "cloud_run_runtime_service_account" {
  value = google_service_account.cloud_run_runtime.email
}

output "wif_provider" {
  value = google_iam_workload_identity_pool_provider.github.name
}

output "wif_pool" {
  value = google_iam_workload_identity_pool.github.name
}

output "cloud_run_services" {
  value = {
    api            = google_cloud_run_v2_service.api.name
    support_hub    = google_cloud_run_v2_service.support_hub.name
    review_console = google_cloud_run_v2_service.review_console.name
    gateway        = google_cloud_run_v2_service.gateway.name
  }
}

output "cloud_run_jobs" {
  value = {
    migrate = google_cloud_run_v2_job.migrate.name
    seed    = google_cloud_run_v2_job.seed.name
  }
}

output "domain_mapping_records" {
  description = "DNS records to create for custom domain mappings (empty when enable_custom_domain = false)"
  value = var.enable_custom_domain ? {
    api = {
      hostname = local.api_hostname
      records  = google_cloud_run_domain_mapping.api[0].status[0].resource_records
    }
    support_hub = {
      hostname = local.hub_hostname
      records  = google_cloud_run_domain_mapping.support_hub[0].status[0].resource_records
    }
    review_console = {
      hostname = local.console_hostname
      records  = google_cloud_run_domain_mapping.review_console[0].status[0].resource_records
    }
  } : {}
}

output "attachments_bucket" {
  description = "GCS bucket for ticket attachment bytes (API ATTACHMENTS_GCS_BUCKET)"
  value       = google_storage_bucket.attachments.name
}

output "secret_ids" {
  description = "Secret Manager secret IDs (values populated by Terraform)"
  value = [
    google_secret_manager_secret.jwt_secret.secret_id,
    google_secret_manager_secret.database_url.secret_id,
    google_secret_manager_secret.database_app_url.secret_id,
    google_secret_manager_secret.redis_url.secret_id,
  ]
  sensitive = false
}
