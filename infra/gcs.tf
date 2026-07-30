resource "google_storage_bucket" "attachments" {
  name                        = "${local.name_prefix}-attachments-${var.project_id}"
  location                    = var.region
  uniform_bucket_level_access = true
  force_destroy               = true
  labels                      = var.labels

  depends_on = [google_project_service.required]
}

resource "google_storage_bucket_iam_member" "runtime_attachments_object_admin" {
  bucket = google_storage_bucket.attachments.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.cloud_run_runtime.email}"
}
