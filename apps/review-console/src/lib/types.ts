import type { OrgRole } from "@unified/types";

export interface OrgMember {
  id: string;
  name: string;
  email: string;
  role: OrgRole;
}

export interface AuditLogRow {
  id: string;
  createdAt: string;
  orgId: string | null;
  userId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  metadata: Record<string, unknown>;
}

export interface AuditListResponse {
  items: AuditLogRow[];
  nextCursor: string | null;
}
