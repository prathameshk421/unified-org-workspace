import type { OrgRole } from "@unified/types";

export interface AuthContext {
  userId: string;
  sessionId: string;
  activeOrgId: string | null;
  role: OrgRole | null;
  isPlatformAdmin: boolean;
}

export interface AccessTokenClaims {
  sub: string;
  sid: string;
  jti: string;
  activeOrgId: string | null;
  role: OrgRole | null;
  isPlatformAdmin: boolean;
}
