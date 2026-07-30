import type { OrgRole } from "@unified/types";

export interface AuthContext {
  userId: string;
  sessionId: string;
  activeOrgId: string | null;
  role: OrgRole | null;
  isPlatformAdmin: boolean;
  /**
   * Session.activeOrgId when live membership verification failed.
   * Used by resource-by-id middleware so resolvers can return 404
   * (membership drop) instead of leaking no_active_org 403.
   */
  staleActiveOrgId?: string | null;
}

export interface AccessTokenClaims {
  sub: string;
  sid: string;
  jti: string;
  activeOrgId: string | null;
  role: OrgRole | null;
  isPlatformAdmin: boolean;
}
