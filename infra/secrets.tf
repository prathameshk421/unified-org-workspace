resource "google_secret_manager_secret" "jwt_secret" {
  secret_id = "JWT_SECRET"
  replication {
    auto {}
  }
  depends_on = [google_project_service.required]
}

resource "google_secret_manager_secret" "database_url" {
  secret_id = "DATABASE_URL"
  replication {
    auto {}
  }
  depends_on = [google_project_service.required]
}

resource "google_secret_manager_secret" "database_app_url" {
  secret_id = "DATABASE_APP_URL"
  replication {
    auto {}
  }
  depends_on = [google_project_service.required]
}

resource "google_secret_manager_secret" "redis_url" {
  secret_id = "REDIS_URL"
  replication {
    auto {}
  }
  depends_on = [google_project_service.required]
}

resource "google_secret_manager_secret_version" "jwt_secret" {
  secret      = google_secret_manager_secret.jwt_secret.id
  secret_data = random_password.jwt_secret.result
}

# Use private IP + Direct VPC egress. Prisma rejects empty-host socket URLs
# like postgresql://user:pass@/db?host=/cloudsql/... (P1013: empty host).
resource "google_secret_manager_secret_version" "database_url" {
  secret      = google_secret_manager_secret.database_url.id
  secret_data = "postgresql://postgres:${random_password.postgres.result}@${google_sql_database_instance.postgres.private_ip_address}:5432/${google_sql_database.unified_org.name}"
}

resource "google_secret_manager_secret_version" "database_app_url" {
  secret      = google_secret_manager_secret.database_app_url.id
  secret_data = "postgresql://unified_app:${random_password.unified_app.result}@${google_sql_database_instance.postgres.private_ip_address}:5432/${google_sql_database.unified_org.name}"
}

resource "google_secret_manager_secret_version" "redis_url" {
  secret      = google_secret_manager_secret.redis_url.id
  secret_data = "redis://${google_redis_instance.main.host}:${google_redis_instance.main.port}"
}

resource "random_password" "jwt_secret" {
  length  = 64
  special = true
}
