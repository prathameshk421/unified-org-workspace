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

export const PrStatus = {
  DRAFT: "DRAFT",
  IN_REVIEW: "IN_REVIEW",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
  MERGED: "MERGED",
} as const;

export type PrStatus = (typeof PrStatus)[keyof typeof PrStatus];

export const PrReviewDecision = {
  APPROVE: "APPROVE",
  REQUEST_CHANGES: "REQUEST_CHANGES",
} as const;

export type PrReviewDecision = (typeof PrReviewDecision)[keyof typeof PrReviewDecision];

export const AuditAction = {
  AUTH_REGISTER: "auth.register",
  AUTH_LOGIN: "auth.login",
  AUTH_LOGOUT: "auth.logout",
  AUTH_LOGOUT_EVERYWHERE: "auth.logout_everywhere",
  AUTH_SWITCH_ORG: "auth.switch_org",
  HTTP_MUTATION: "http.mutation",
  PR_CREATE: "pr.create",
  PR_UPDATE: "pr.update",
  PR_SUBMIT_REVIEW: "pr.submit_review",
  PR_APPROVE: "pr.approve",
  PR_REQUEST_CHANGES: "pr.request_changes",
  PR_REJECT: "pr.reject",
  PR_MERGE: "pr.merge",
  PR_STATUS_CHANGE: "pr.status_change",
} as const;

export type AuditAction = (typeof AuditAction)[keyof typeof AuditAction];

export const TICKET_READER_ROLES = [...TICKET_MUTATOR_ROLES, OrgRole.CROSS_ORG_GUEST] as const;

export const OrgConnectionStatus = {
  PENDING: "PENDING",
  ACCEPTED: "ACCEPTED",
  REJECTED: "REJECTED",
  REVOKED: "REVOKED",
} as const;

export type OrgConnectionStatus = (typeof OrgConnectionStatus)[keyof typeof OrgConnectionStatus];

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

export interface PullRequestSummary {
  id: string;
  title: string;
  description: string;
  status: PrStatus;
  authorId: string;
  requiresApprovals: number;
  currentVersion: number;
  createdAt: string;
  updatedAt: string;
}

export interface PrReviewerSummary {
  userId: string;
}

export interface PrReviewDto {
  id: string;
  reviewerId: string;
  versionId: string;
  decision: PrReviewDecision;
  comment: string;
  createdAt: string;
}

export interface PrVersionDto {
  id: string;
  versionNumber: number;
  title: string;
  description: string;
  createdById: string;
  createdAt: string;
}

export interface PullRequestDetail extends PullRequestSummary {
  reviewers: PrReviewerSummary[];
  reviews: PrReviewDto[];
  versions: PrVersionDto[];
}

export interface PrDiffChange {
  field: "title" | "description";
  before: string;
  after: string;
}

export interface PrDiffResponse {
  fromVersion: number;
  toVersion: number;
  changes: PrDiffChange[];
}

export interface CreatePrRequest {
  title: string;
  description?: string;
  requiresApprovals?: number;
  reviewerIds?: string[];
}

export interface UpdatePrRequest {
  title?: string;
  description?: string;
  requiresApprovals?: number;
  reviewerIds?: string[];
}

export interface SubmitReviewRequest {
  decision: PrReviewDecision;
  comment?: string;
}

export interface TransitionPrRequest {
  to: PrStatus;
}
