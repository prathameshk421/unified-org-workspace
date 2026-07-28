export type HealthStatus = "ok" | "degraded" | "down";

export interface HealthCheckResponse {
  status: HealthStatus;
  service: string;
  timestamp: string;
}

export type AppName = "api" | "support-hub" | "review-console";

export interface AppMetadata {
  name: AppName;
  version: string;
}
