locals {
  name_prefix = "unified-org"

  api_hostname     = "api.${var.domain}"
  hub_hostname     = "hub.${var.domain}"
  console_hostname = "console.${var.domain}"

  cookie_domain = ".${var.domain}"

  artifact_registry_location = var.region
  image_base                 = "${var.region}-docker.pkg.dev/${var.project_id}/${var.artifact_registry_repo}"

  api_image     = var.placeholder_image
  hub_image     = var.placeholder_image
  console_image = var.placeholder_image
  gateway_image = var.placeholder_image
  migrate_image = var.placeholder_image

  api_secret_env_vars = [
    {
      name   = "JWT_SECRET"
      secret = google_secret_manager_secret.jwt_secret.secret_id
    },
    {
      name   = "DATABASE_APP_URL"
      secret = google_secret_manager_secret.database_app_url.secret_id
    },
    {
      name   = "REDIS_URL"
      secret = google_secret_manager_secret.redis_url.secret_id
    },
  ]
}
