resource "google_cloud_run_v2_service" "api" {
  name                = "${local.name_prefix}-api"
  location            = var.region
  ingress             = "INGRESS_TRAFFIC_ALL"
  deletion_protection = false

  template {
    service_account = google_service_account.cloud_run_runtime.email

    scaling {
      min_instance_count = 0
      max_instance_count = 10
    }

    vpc_access {
      egress = "PRIVATE_RANGES_ONLY"
      network_interfaces {
        network    = google_compute_network.main.id
        subnetwork = google_compute_subnetwork.main.id
      }
    }

    volumes {
      name = "cloudsql"
      cloud_sql_instance {
        instances = [google_sql_database_instance.postgres.connection_name]
      }
    }

    containers {
      image = local.api_image

      ports {
        container_port = 8080
      }

      volume_mounts {
        name       = "cloudsql"
        mount_path = "/cloudsql"
      }

      env {
        name  = "NODE_ENV"
        value = "production"
      }

      env {
        name  = "ATTACHMENTS_BACKEND"
        value = "gcs"
      }

      env {
        name  = "ATTACHMENTS_GCS_BUCKET"
        value = google_storage_bucket.attachments.name
      }

      dynamic "env" {
        for_each = var.enable_custom_domain ? [1] : []
        content {
          name  = "API_URL"
          value = "https://${local.api_hostname}"
        }
      }

      dynamic "env" {
        for_each = var.enable_custom_domain ? [1] : []
        content {
          name  = "COOKIE_DOMAIN"
          value = local.cookie_domain
        }
      }

      env {
        name  = "CORS_ORIGINS"
        value = var.enable_custom_domain ? "https://${local.hub_hostname},https://${local.console_hostname}" : "${google_cloud_run_v2_service.support_hub.uri},${google_cloud_run_v2_service.review_console.uri}"
      }

      dynamic "env" {
        for_each = local.api_secret_env_vars
        content {
          name = env.value.name
          value_source {
            secret_key_ref {
              secret  = env.value.secret
              version = "latest"
            }
          }
        }
      }

      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
      }
    }
  }

  lifecycle {
    ignore_changes = [
      template[0].containers[0].image,
      client,
      client_version,
    ]
  }

  depends_on = [
    google_project_service.required,
    google_artifact_registry_repository.main,
    google_secret_manager_secret_version.database_app_url,
    google_secret_manager_secret_version.jwt_secret,
    google_secret_manager_secret_version.redis_url,
    google_project_iam_member.runtime_secret_accessor,
    google_project_iam_member.runtime_sql_client,
    google_storage_bucket_iam_member.runtime_attachments_object_admin,
  ]
}

resource "google_cloud_run_v2_service" "support_hub" {
  name                = "${local.name_prefix}-support-hub"
  location            = var.region
  ingress             = "INGRESS_TRAFFIC_ALL"
  deletion_protection = false

  template {
    service_account = google_service_account.cloud_run_runtime.email

    scaling {
      min_instance_count = 0
      max_instance_count = 10
    }

    containers {
      image = local.hub_image

      ports {
        container_port = 8080
      }

      env {
        name  = "NODE_ENV"
        value = "production"
      }

      env {
        name  = "HOSTNAME"
        value = "0.0.0.0"
      }

      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
      }
    }
  }

  lifecycle {
    ignore_changes = [
      template[0].containers[0].image,
      client,
      client_version,
    ]
  }

  depends_on = [
    google_project_service.required,
    google_artifact_registry_repository.main,
  ]
}

resource "google_cloud_run_v2_service" "review_console" {
  name                = "${local.name_prefix}-review-console"
  location            = var.region
  ingress             = "INGRESS_TRAFFIC_ALL"
  deletion_protection = false

  template {
    service_account = google_service_account.cloud_run_runtime.email

    scaling {
      min_instance_count = 0
      max_instance_count = 10
    }

    containers {
      image = local.console_image

      ports {
        container_port = 8080
      }

      env {
        name  = "NODE_ENV"
        value = "production"
      }

      env {
        name  = "HOSTNAME"
        value = "0.0.0.0"
      }

      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
      }
    }
  }

  lifecycle {
    ignore_changes = [
      template[0].containers[0].image,
      client,
      client_version,
    ]
  }

  depends_on = [
    google_project_service.required,
    google_artifact_registry_repository.main,
  ]
}

resource "google_cloud_run_v2_job" "migrate" {
  name                = "${local.name_prefix}-migrate"
  location            = var.region
  deletion_protection = false

  template {
    template {
      service_account = google_service_account.cloud_run_runtime.email
      timeout         = "600s"

      vpc_access {
        egress = "PRIVATE_RANGES_ONLY"
        network_interfaces {
          network    = google_compute_network.main.id
          subnetwork = google_compute_subnetwork.main.id
        }
      }

      volumes {
        name = "cloudsql"
        cloud_sql_instance {
          instances = [google_sql_database_instance.postgres.connection_name]
        }
      }

      containers {
        image = local.migrate_image

        volume_mounts {
          name       = "cloudsql"
          mount_path = "/cloudsql"
        }

        env {
          name = "DATABASE_URL"
          value_source {
            secret_key_ref {
              secret  = google_secret_manager_secret.database_url.secret_id
              version = "latest"
            }
          }
        }

        resources {
          limits = {
            cpu    = "1"
            memory = "512Mi"
          }
        }
      }
    }
  }

  lifecycle {
    ignore_changes = [
      template[0].template[0].containers[0].image,
      client,
      client_version,
    ]
  }

  depends_on = [
    google_project_service.required,
    google_artifact_registry_repository.main,
    google_secret_manager_secret_version.database_url,
    google_project_iam_member.runtime_secret_accessor,
    google_project_iam_member.runtime_sql_client,
  ]
}

resource "google_cloud_run_v2_job" "seed" {
  name                = "${local.name_prefix}-seed"
  location            = var.region
  deletion_protection = false

  template {
    template {
      service_account = google_service_account.cloud_run_runtime.email
      timeout         = "600s"

      vpc_access {
        egress = "PRIVATE_RANGES_ONLY"
        network_interfaces {
          network    = google_compute_network.main.id
          subnetwork = google_compute_subnetwork.main.id
        }
      }

      volumes {
        name = "cloudsql"
        cloud_sql_instance {
          instances = [google_sql_database_instance.postgres.connection_name]
        }
      }

      containers {
        image   = local.migrate_image
        command = ["pnpm", "exec", "prisma", "db", "seed"]

        volume_mounts {
          name       = "cloudsql"
          mount_path = "/cloudsql"
        }

        env {
          name = "DATABASE_URL"
          value_source {
            secret_key_ref {
              secret  = google_secret_manager_secret.database_url.secret_id
              version = "latest"
            }
          }
        }

        env {
          name  = "ATTACHMENTS_BACKEND"
          value = "gcs"
        }

        env {
          name  = "ATTACHMENTS_GCS_BUCKET"
          value = google_storage_bucket.attachments.name
        }

        resources {
          limits = {
            cpu    = "1"
            memory = "512Mi"
          }
        }
      }
    }
  }

  lifecycle {
    ignore_changes = [
      template[0].template[0].containers[0].image,
      client,
      client_version,
    ]
  }

  depends_on = [
    google_project_service.required,
    google_artifact_registry_repository.main,
    google_secret_manager_secret_version.database_url,
    google_project_iam_member.runtime_secret_accessor,
    google_project_iam_member.runtime_sql_client,
    google_storage_bucket_iam_member.runtime_attachments_object_admin,
  ]
}

resource "google_cloud_run_v2_service" "gateway" {
  name                = "${local.name_prefix}-gateway"
  location            = var.region
  ingress             = "INGRESS_TRAFFIC_ALL"
  deletion_protection = false

  template {
    service_account = google_service_account.cloud_run_runtime.email

    scaling {
      min_instance_count = 0
      max_instance_count = 10
    }

    containers {
      image = local.gateway_image

      ports {
        container_port = 8080
      }

      env {
        name  = "API_UPSTREAM"
        value = google_cloud_run_v2_service.api.uri
      }

      env {
        name  = "HUB_UPSTREAM"
        value = google_cloud_run_v2_service.support_hub.uri
      }

      env {
        name  = "CONSOLE_UPSTREAM"
        value = google_cloud_run_v2_service.review_console.uri
      }

      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
      }
    }
  }

  lifecycle {
    ignore_changes = [
      template[0].containers[0].image,
      client,
      client_version,
    ]
  }

  depends_on = [
    google_project_service.required,
    google_artifact_registry_repository.main,
    google_cloud_run_v2_service.api,
    google_cloud_run_v2_service.support_hub,
    google_cloud_run_v2_service.review_console,
  ]
}

resource "google_cloud_run_v2_service_iam_member" "api_public" {
  location = google_cloud_run_v2_service.api.location
  name     = google_cloud_run_v2_service.api.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

resource "google_cloud_run_v2_service_iam_member" "support_hub_public" {
  location = google_cloud_run_v2_service.support_hub.location
  name     = google_cloud_run_v2_service.support_hub.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

resource "google_cloud_run_v2_service_iam_member" "review_console_public" {
  location = google_cloud_run_v2_service.review_console.location
  name     = google_cloud_run_v2_service.review_console.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

resource "google_cloud_run_v2_service_iam_member" "gateway_public" {
  location = google_cloud_run_v2_service.gateway.location
  name     = google_cloud_run_v2_service.gateway.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

# Digest worker — same API image, DATABASE_APP_URL (unified_app), not DATABASE_URL
resource "google_cloud_run_v2_job" "digest" {
  name                = "${local.name_prefix}-digest"
  location            = var.region
  deletion_protection = false

  template {
    template {
      service_account = google_service_account.cloud_run_runtime.email
      timeout         = "600s"
      max_retries     = 1

      vpc_access {
        egress = "PRIVATE_RANGES_ONLY"
        network_interfaces {
          network    = google_compute_network.main.id
          subnetwork = google_compute_subnetwork.main.id
        }
      }

      volumes {
        name = "cloudsql"
        cloud_sql_instance {
          instances = [google_sql_database_instance.postgres.connection_name]
        }
      }

      containers {
        image   = local.api_image
        command = ["node", "dist/worker/digest-once.js"]

        volume_mounts {
          name       = "cloudsql"
          mount_path = "/cloudsql"
        }

        env {
          name  = "DIGEST_ENABLED"
          value = var.digest_enabled ? "true" : "false"
        }

        env {
          name  = "DIGEST_LLM_ENABLED"
          value = var.groq_api_key != "unset" ? "true" : "false"
        }

        env {
          name  = "GROQ_MODEL"
          value = "openai/gpt-oss-20b"
        }

        env {
          name = "DATABASE_APP_URL"
          value_source {
            secret_key_ref {
              secret  = google_secret_manager_secret.database_app_url.secret_id
              version = "latest"
            }
          }
        }

        env {
          name = "JWT_SECRET"
          value_source {
            secret_key_ref {
              secret  = google_secret_manager_secret.jwt_secret.secret_id
              version = "latest"
            }
          }
        }

        env {
          name = "GROQ_API_KEY"
          value_source {
            secret_key_ref {
              secret  = google_secret_manager_secret.groq_api_key.secret_id
              version = "latest"
            }
          }
        }

        resources {
          limits = {
            cpu    = "1"
            memory = "512Mi"
          }
        }
      }
    }
  }

  lifecycle {
    ignore_changes = [
      template[0].template[0].containers[0].image,
      client,
      client_version,
    ]
  }

  depends_on = [
    google_project_service.required,
    google_artifact_registry_repository.main,
    google_secret_manager_secret_version.database_app_url,
    google_secret_manager_secret_version.jwt_secret,
    google_secret_manager_secret_version.groq_api_key,
    google_project_iam_member.runtime_secret_accessor,
    google_project_iam_member.runtime_sql_client,
  ]
}
