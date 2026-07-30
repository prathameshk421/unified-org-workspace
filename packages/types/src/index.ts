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

export const AuditAction = {
  AUTH_REGISTER: "auth.register",
  AUTH_LOGIN: "auth.login",
  AUTH_LOGOUT: "auth.logout",
  AUTH_LOGOUT_EVERYWHERE: "auth.logout_everywhere",
  AUTH_SWITCH_ORG: "auth.switch_org",
  HTTP_MUTATION: "http.mutation",
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
} as const;

export type AuditAction = (typeof AuditAction)[keyof typeof AuditAction];

export const TICKET_READER_ROLES = [
  ...TICKET_MUTATOR_ROLES,
  OrgRole.CROSS_ORG_GUEST,
] as const;

export const ORG_SETTINGS_READER_ROLES = TICKET_READER_ROLES;
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
