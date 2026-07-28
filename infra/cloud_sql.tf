resource "random_password" "postgres" {
  length  = 32
  special = false
}

resource "random_password" "unified_app" {
  length  = 32
  special = false
}

resource "google_sql_database_instance" "postgres" {
  name             = "${local.name_prefix}-pg"
  database_version = "POSTGRES_16"
  region           = var.region

  settings {
    # ENTERPRISE required for shared-core tiers (db-f1-micro). Provider may default ENTERPRISE_PLUS.
    edition           = "ENTERPRISE"
    tier              = var.db_tier
    availability_type = "ZONAL"
    disk_size         = 10
    disk_type         = "PD_SSD"

    ip_configuration {
      ipv4_enabled    = false
      private_network = google_compute_network.main.id
    }

    backup_configuration {
      enabled = true
    }

    database_flags {
      name  = "cloudsql.iam_authentication"
      value = "on"
    }
  }

  deletion_protection = false

  depends_on = [
    google_service_networking_connection.private_vpc_connection,
    google_project_service.required,
  ]
}

resource "google_sql_database" "unified_org" {
  name     = "unified_org"
  instance = google_sql_database_instance.postgres.name
}

resource "google_sql_user" "postgres" {
  name     = "postgres"
  instance = google_sql_database_instance.postgres.name
  password = random_password.postgres.result
}

resource "google_sql_user" "unified_app" {
  name     = "unified_app"
  instance = google_sql_database_instance.postgres.name
  password = random_password.unified_app.result
}
