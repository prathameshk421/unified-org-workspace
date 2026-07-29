export const OrgRole = {
  ORG_ADMIN: "ORG_ADMIN",
  SUPPORT_AGENT: "SUPPORT_AGENT",
  REVIEWER: "REVIEWER",
  CROSS_ORG_GUEST: "CROSS_ORG_GUEST",
} as const;

export type OrgRole = (typeof OrgRole)[keyof typeof OrgRole];

/** Roles that can mutate tickets in-org (guests excluded). */
export const TICKET_MUTATOR_ROLES = [
  OrgRole.ORG_ADMIN,
  OrgRole.SUPPORT_AGENT,
  OrgRole.REVIEWER,
] as const;

export const PR_MUTATOR_ROLES = [OrgRole.ORG_ADMIN, OrgRole.REVIEWER] as const;

export const AUDIT_VIEWER_ROLES = [OrgRole.ORG_ADMIN, OrgRole.REVIEWER] as const;

export const TICKET_READER_ROLES = [
  ...TICKET_MUTATOR_ROLES,
  OrgRole.CROSS_ORG_GUEST,
] as const;

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

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  isPlatformAdmin: boolean;
  createdAt?: string;
}

export interface MembershipSummary {
  orgId: string;
  orgName: string;
  orgSlug: string;
  role: OrgRole;
}

export interface ActiveOrgContext {
  orgId: string;
  orgName?: string;
  orgSlug?: string;
  role: OrgRole;
}

export interface MeResponse {
  user: AuthUser;
  memberships: MembershipSummary[];
  activeOrg: ActiveOrgContext | null;
}

export interface LoginResponse {
  user: AuthUser;
  activeOrg: Pick<ActiveOrgContext, "orgId" | "role"> | null;
}

export interface RegisterResponse {
  user: Pick<AuthUser, "id" | "email" | "name">;
}

export interface SwitchOrgRequest {
  orgId: string;
}

export interface SwitchOrgResponse {
  activeOrg: Pick<ActiveOrgContext, "orgId" | "role">;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  name: string;
}
