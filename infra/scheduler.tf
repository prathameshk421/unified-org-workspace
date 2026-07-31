resource "google_service_account" "digest_scheduler" {
  account_id   = "${local.name_prefix}-digest-sched"
  display_name = "Cloud Scheduler invoker for digest job"
}

resource "google_cloud_run_v2_job_iam_member" "digest_scheduler_runner" {
  project  = var.project_id
  location = google_cloud_run_v2_job.digest.location
  name     = google_cloud_run_v2_job.digest.name
  role     = "roles/run.developer"
  member   = "serviceAccount:${google_service_account.digest_scheduler.email}"
}

resource "google_cloud_scheduler_job" "digest_daily" {
  name             = "${local.name_prefix}-digest-daily"
  description      = "Run AI progress digest job every 3 hours (UTC)"
  schedule         = "0 */3 * * *"
  time_zone        = "Etc/UTC"
  attempt_deadline = "320s"
  region           = var.region

  http_target {
    http_method = "POST"
    uri         = "https://${var.region}-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/${var.project_id}/jobs/${google_cloud_run_v2_job.digest.name}:run"

    oauth_token {
      service_account_email = google_service_account.digest_scheduler.email
      scope                 = "https://www.googleapis.com/auth/cloud-platform"
    }
  }

  depends_on = [
    google_project_service.required,
    google_cloud_run_v2_job.digest,
    google_cloud_run_v2_job_iam_member.digest_scheduler_runner,
  ]
}
