resource "google_redis_instance" "main" {
  name               = "${local.name_prefix}-redis"
  tier               = "BASIC"
  memory_size_gb     = var.redis_memory_gb
  region             = var.region
  redis_version      = "REDIS_7_0"
  authorized_network = google_compute_network.main.id
  connect_mode       = "PRIVATE_SERVICE_ACCESS"

  depends_on = [
    google_service_networking_connection.private_vpc_connection,
    google_project_service.required,
  ]
}
