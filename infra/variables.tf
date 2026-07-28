variable "project_id" {
  description = "GCP project ID"
  type        = string
}

variable "region" {
  description = "GCP region for regional resources"
  type        = string
  default     = "us-central1"
}

variable "enable_custom_domain" {
  description = "Create Cloud Run domain mappings and cookie/CORS hostnames. Set false to use default *.run.app URLs."
  type        = bool
  default     = false
}

variable "domain" {
  description = "Parent domain for custom hostnames (only used when enable_custom_domain = true)"
  type        = string
  default     = "unused.local"
}

variable "github_repo" {
  description = "GitHub repository in owner/name format for Workload Identity Federation"
  type        = string
}

variable "db_tier" {
  description = "Cloud SQL machine tier"
  type        = string
  default     = "db-f1-micro"
}

variable "redis_memory_gb" {
  description = "Memorystore Redis memory size in GB"
  type        = number
  default     = 1
}

variable "artifact_registry_repo" {
  description = "Artifact Registry repository ID"
  type        = string
  default     = "unified-org"
}

variable "labels" {
  description = "Labels applied to supported resources"
  type        = map(string)
  default = {
    app     = "unified-org-workspace"
    managed = "terraform"
  }
}

variable "placeholder_image" {
  description = "Placeholder image used until CI publishes application images"
  type        = string
  default     = "us-docker.pkg.dev/cloudrun/container/hello"
}
