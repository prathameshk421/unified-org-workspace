export const OrgRole = {
  ORG_ADMIN: "ORG_ADMIN",
  SUPPORT_AGENT: "SUPPORT_AGENT",
  REVIEWER: "REVIEWER",
  CROSS_ORG_GUEST: "CROSS_ORG_GUEST",
} as const;

export type OrgRole = (typeof OrgRole)[keyof typeof OrgRole];

export const OrgConnectionStatus = {
  PENDING: "PENDING",
  ACCEPTED: "ACCEPTED",
  REJECTED: "REJECTED",
  REVOKED: "REVOKED",
} as const;

export type OrgConnectionStatus =
  (typeof OrgConnectionStatus)[keyof typeof OrgConnectionStatus];

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
