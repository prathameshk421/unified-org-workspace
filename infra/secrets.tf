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

resource "google_secret_manager_secret_version" "jwt_secret" {
  secret      = google_secret_manager_secret.jwt_secret.id
  secret_data = random_password.jwt_secret.result
}

# Use private IP + Direct VPC egress. Prisma rejects empty-host socket URLs
# like postgresql://user:pass@/db?host=/cloudsql/... (P1013: empty host).
# connect_timeout=60: Direct VPC cold start can exceed Prisma's default 5s.
resource "google_secret_manager_secret_version" "database_url" {
  secret      = google_secret_manager_secret.database_url.id
  secret_data = "postgresql://postgres:${random_password.postgres.result}@${google_sql_database_instance.postgres.private_ip_address}:5432/${google_sql_database.unified_org.name}?connect_timeout=60"
}

resource "google_secret_manager_secret_version" "database_app_url" {
  secret      = google_secret_manager_secret.database_app_url.id
  secret_data = "postgresql://unified_app:${random_password.unified_app.result}@${google_sql_database_instance.postgres.private_ip_address}:5432/${google_sql_database.unified_org.name}?connect_timeout=60"
}

resource "google_secret_manager_secret" "groq_api_key" {
  secret_id = "GROQ_API_KEY"
  replication {
    auto {}
  }
  depends_on = [google_project_service.required]
}

resource "google_secret_manager_secret_version" "groq_api_key" {
  secret      = google_secret_manager_secret.groq_api_key.id
  secret_data = var.groq_api_key
}

# Argus digest email (Gmail SMTP) — mounted on digest job only
resource "google_secret_manager_secret" "smtp_pass" {
  secret_id = "SMTP_PASS"
  replication {
    auto {}
  }
  depends_on = [google_project_service.required]
}

resource "google_secret_manager_secret_version" "smtp_pass" {
  secret      = google_secret_manager_secret.smtp_pass.id
  secret_data = var.smtp_pass
}

resource "google_secret_manager_secret" "smtp_user" {
  secret_id = "SMTP_USER"
  replication {
    auto {}
  }
  depends_on = [google_project_service.required]
}

resource "google_secret_manager_secret_version" "smtp_user" {
  secret      = google_secret_manager_secret.smtp_user.id
  secret_data = var.smtp_user
}

resource "random_password" "jwt_secret" {
  length  = 64
  special = true
}
