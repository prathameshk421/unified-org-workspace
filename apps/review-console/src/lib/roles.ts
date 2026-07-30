import { AUDIT_VIEWER_ROLES, PR_MUTATOR_ROLES, type OrgRole } from "@unified/types";

export function canMutatePrs(role: OrgRole | undefined): boolean {
  return role !== undefined && (PR_MUTATOR_ROLES as readonly OrgRole[]).includes(role);
}

export function canViewAudit(role: OrgRole | undefined): boolean {
  return role !== undefined && (AUDIT_VIEWER_ROLES as readonly OrgRole[]).includes(role);
}
