resource "google_artifact_registry_repository" "main" {
  location      = local.artifact_registry_location
  repository_id = var.artifact_registry_repo
  description   = "Container images for unified-org-workspace"
  format        = "DOCKER"
  labels        = var.labels

  depends_on = [google_project_service.required]
}
