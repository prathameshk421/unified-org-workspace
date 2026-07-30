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
  TICKET_CREATE: "ticket.create",
  TICKET_UPDATE: "ticket.update",
  TICKET_STATUS_CHANGE: "ticket.status_change",
  TICKET_DELETE: "ticket.delete",
  COMMENT_CREATE: "comment.create",
  COMMENT_UPDATE: "comment.update",
  COMMENT_DELETE: "comment.delete",
  ATTACHMENT_UPLOAD: "attachment.upload",
  ATTACHMENT_DELETE: "attachment.delete",
  ORG_SETTINGS_UPDATE: "org.settings_update",
  CONNECTION_REQUEST: "connection.request",
  CONNECTION_ACCEPT: "connection.accept",
  CONNECTION_REJECT: "connection.reject",
  CONNECTION_REVOKE: "connection.revoke",
  CONNECTION_FORCE_REVOKE: "connection.force_revoke",
  SHARE_CREATE: "share.create",
  SHARE_REVOKE: "share.revoke",
  DIGEST_RUN_COMPLETED: "digest.run_completed",
  DIGEST_RUN_FAILED: "digest.run_failed",
} as const;

export type AuditAction = (typeof AuditAction)[keyof typeof AuditAction];

export const TICKET_READER_ROLES = [...TICKET_MUTATOR_ROLES, OrgRole.CROSS_ORG_GUEST] as const;

/** Guests cannot read org settings (assignee-only ticket visibility only). */
export const ORG_SETTINGS_READER_ROLES = TICKET_MUTATOR_ROLES;
export const ORG_SETTINGS_MUTATOR_ROLES = [OrgRole.ORG_ADMIN] as const;

export const COMMENT_CREATE_ROLES = TICKET_READER_ROLES;
export const COMMENT_UPDATE_ROLES = TICKET_MUTATOR_ROLES;
export const COMMENT_DELETE_ROLES = TICKET_MUTATOR_ROLES;

export const ATTACHMENT_UPLOAD_ROLES = TICKET_MUTATOR_ROLES;
export const ATTACHMENT_READER_ROLES = TICKET_READER_ROLES;
export const ATTACHMENT_DELETE_ROLES = TICKET_MUTATOR_ROLES;

export const DEFAULT_ORG_FEATURE_FLAGS = {
  commentsEnabled: true,
  attachmentsEnabled: true,
} as const;

export type OrgFeatureFlags = {
  commentsEnabled: boolean;
  attachmentsEnabled: boolean;
};

export type OrgSettings = {
  timezone?: string;
  featureFlags: OrgFeatureFlags;
};

export const ALLOWED_ATTACHMENT_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "application/pdf",
  "text/plain",
  "text/csv",
] as const;

export type AllowedAttachmentMimeType =
  (typeof ALLOWED_ATTACHMENT_MIME_TYPES)[number];

export const ATTACHMENT_MAX_BYTES = 5_242_880;
export const ATTACHMENT_MAX_PER_TICKET = 10;

export const TicketStatus = {
  OPEN: "OPEN",
  IN_PROGRESS: "IN_PROGRESS",
  RESOLVED: "RESOLVED",
  CLOSED: "CLOSED",
} as const;

export type TicketStatus = (typeof TicketStatus)[keyof typeof TicketStatus];

export const TICKET_STATUS_TRANSITIONS: Record<
  TicketStatus,
  readonly TicketStatus[]
> = {
  [TicketStatus.OPEN]: [TicketStatus.IN_PROGRESS, TicketStatus.CLOSED],
  [TicketStatus.IN_PROGRESS]: [
    TicketStatus.OPEN,
    TicketStatus.RESOLVED,
    TicketStatus.CLOSED,
  ],
  [TicketStatus.RESOLVED]: [TicketStatus.IN_PROGRESS, TicketStatus.CLOSED],
  [TicketStatus.CLOSED]: [TicketStatus.OPEN],
};

export const OrgConnectionStatus = {
  PENDING: "PENDING",
  ACCEPTED: "ACCEPTED",
  REJECTED: "REJECTED",
  REVOKED: "REVOKED",
} as const;

export type OrgConnectionStatus = (typeof OrgConnectionStatus)[keyof typeof OrgConnectionStatus];

export const ShareResourceType = {
  TICKET: "TICKET",
  PULL_REQUEST: "PULL_REQUEST",
} as const;

export type ShareResourceType =
  (typeof ShareResourceType)[keyof typeof ShareResourceType];

export const ShareGrantStatus = {
  ACTIVE: "ACTIVE",
  REVOKED: "REVOKED",
} as const;

export type ShareGrantStatus =
  (typeof ShareGrantStatus)[keyof typeof ShareGrantStatus];

export const DigestRunStatus = {
  RUNNING: "RUNNING",
  SUCCEEDED: "SUCCEEDED",
  FAILED: "FAILED",
  SKIPPED: "SKIPPED",
} as const;

export type DigestRunStatus =
  (typeof DigestRunStatus)[keyof typeof DigestRunStatus];

export const NotificationType = {
  DIGEST: "DIGEST",
} as const;

export type NotificationType =
  (typeof NotificationType)[keyof typeof NotificationType];

export const NotificationChannel = {
  IN_APP: "IN_APP",
} as const;

export type NotificationChannel =
  (typeof NotificationChannel)[keyof typeof NotificationChannel];

export interface NotificationDto {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationListResponse {
  items: NotificationDto[];
  nextCursor: string | null;
}

export interface NotificationUnreadCountResponse {
  count: number;
}

export type ResourceAccess = "member" | "shared";

export interface SharedFromOrgSummary {
  orgId: string;
  orgName: string;
  orgSlug: string;
}

export interface ConnectionPartnerOrg {
  orgId: string;
  orgName: string;
  orgSlug: string;
}

export interface ConnectionDto {
  id: string;
  status: OrgConnectionStatus;
  partnerOrg: ConnectionPartnerOrg;
  direction: "incoming" | "outgoing";
  requestedById: string;
  respondedById: string | null;
  createdAt: string;
}

export interface ShareGrantDto {
  id: string;
  resourceType: ShareResourceType;
  resourceId: string;
  ownerOrgId: string;
  granteeOrgId: string;
  grantedToUserId: string;
  grantedByUserId: string;
  orgConnectionId: string;
  status: ShareGrantStatus;
  revokedAt: string | null;
  revokedById: string | null;
  revokeReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ConnectionRecipientDto {
  userId: string;
  name: string;
  initials: string;
}

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
  access?: ResourceAccess;
  sharedFromOrg?: SharedFromOrgSummary;
}

export interface TicketResponse {
  id: string;
  orgId: string;
  title: string;
  description: string;
  status: TicketStatus;
  createdById: string;
  assigneeId: string | null;
  createdAt: string;
  updatedAt: string;
  access?: ResourceAccess;
  sharedFromOrg?: SharedFromOrgSummary;
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

export interface PrCommentResponse {
  id: string;
  pullRequestId: string;
  orgId: string;
  authorOrgId: string | null;
  authorId: string;
  body: string;
  createdAt: string;
  updatedAt: string;
}

export interface PrCommentListResponse {
  comments: PrCommentResponse[];
}

export interface CreatePrCommentRequest {
  body: string;
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

export interface TicketListResponse {
  tickets: TicketResponse[];
}

export interface CreateTicketRequest {
  title: string;
  description?: string;
  assigneeId?: string | null;
}

export interface UpdateTicketRequest {
  title?: string;
  description?: string;
  assigneeId?: string | null;
}

export interface UpdateTicketStatusRequest {
  status: TicketStatus;
}

export interface TicketCommentResponse {
  id: string;
  ticketId: string;
  orgId: string;
  authorId: string;
  body: string;
  createdAt: string;
  updatedAt: string;
}

export interface TicketCommentListResponse {
  comments: TicketCommentResponse[];
}

export interface CreateTicketCommentRequest {
  body: string;
}

export interface UpdateTicketCommentRequest {
  body: string;
}

export interface TicketAttachmentResponse {
  id: string;
  ticketId: string;
  orgId: string;
  uploadedById: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}

export interface TicketAttachmentListResponse {
  attachments: TicketAttachmentResponse[];
}

export interface OrgSettingsResponse {
  orgId: string;
  settings: OrgSettings;
}

export interface UpdateOrgSettingsRequest {
  timezone?: string;
  featureFlags?: Partial<OrgFeatureFlags>;
}
