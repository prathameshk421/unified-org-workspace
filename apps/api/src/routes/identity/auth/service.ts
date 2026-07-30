import type { OrgRole } from "@unified/types";
import { AuditAction } from "@unified/types";
import { record } from "../../../lib/audit-log.js";
import { prisma } from "../../../lib/prisma.js";
import type { AuthContext } from "./types.js";
import {
  createOpaqueRefreshToken,
  getRefreshExpiry,
  getSessionExpiry,
  hashRefreshToken,
  signAccessToken,
  verifyAccessTokenAllowExpired,
} from "./tokens.js";

export class AuthError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "AuthError";
  }
}

interface MembershipSummary {
  orgId: string;
  orgName: string;
  orgSlug: string;
  role: OrgRole;
}

async function getAcceptedMemberships(userId: string): Promise<MembershipSummary[]> {
  const memberships = await prisma.orgMembership.findMany({
    where: {
      userId,
      acceptedAt: { not: null },
    },
    include: {
      org: {
        select: {
          id: true,
          name: true,
          slug: true,
        },
      },
    },
    orderBy: { invitedAt: "asc" },
  });

  return memberships.map((membership) => ({
    orgId: membership.orgId,
    orgName: membership.org.name,
    orgSlug: membership.org.slug,
    role: membership.role as OrgRole,
  }));
}

async function getDefaultOrgContext(userId: string): Promise<{
  activeOrgId: string | null;
  role: OrgRole | null;
}> {
  const memberships = await getAcceptedMemberships(userId);
  if (memberships.length === 0) {
    return { activeOrgId: null, role: null };
  }

  const first = memberships[0]!;
  return { activeOrgId: first.orgId, role: first.role };
}

async function verifyMembership(userId: string, orgId: string): Promise<OrgRole> {
  const membership = await prisma.orgMembership.findUnique({
    where: {
      userId_orgId: { userId, orgId },
    },
  });

  if (!membership || !membership.acceptedAt) {
    throw new AuthError("You are not a member of this organization", 403);
  }

  return membership.role as OrgRole;
}

async function createSessionWithTokens(input: {
  userId: string;
  isPlatformAdmin: boolean;
  activeOrgId: string | null;
  role: OrgRole | null;
  userAgent?: string;
  ipAddress?: string;
}): Promise<{
  accessToken: string;
  refreshToken: string;
  sessionId: string;
}> {
  const sessionExpiresAt = getSessionExpiry();
  const refreshExpiresAt = getRefreshExpiry();
  const refreshToken = createOpaqueRefreshToken();
  const refreshTokenHash = hashRefreshToken(refreshToken);

  const session = await prisma.session.create({
    data: {
      userId: input.userId,
      activeOrgId: input.activeOrgId,
      userAgent: input.userAgent,
      ipAddress: input.ipAddress,
      expiresAt: sessionExpiresAt,
      refreshTokens: {
        create: {
          tokenHash: refreshTokenHash,
          expiresAt: refreshExpiresAt,
        },
      },
    },
  });

  const accessToken = await signAccessToken({
    userId: input.userId,
    sessionId: session.id,
    activeOrgId: input.activeOrgId,
    role: input.role,
    isPlatformAdmin: input.isPlatformAdmin,
  });

  return {
    accessToken,
    refreshToken,
    sessionId: session.id,
  };
}

async function revokeSession(sessionId: string): Promise<void> {
  const now = new Date();
  await prisma.$transaction([
    prisma.session.update({
      where: { id: sessionId },
      data: { revokedAt: now },
    }),
    prisma.refreshToken.updateMany({
      where: { sessionId, revokedAt: null },
      data: { revokedAt: now },
    }),
  ]);
}

async function revokeAllUserSessions(userId: string): Promise<void> {
  const now = new Date();
  const sessions = await prisma.session.findMany({
    where: { userId, revokedAt: null },
    select: { id: true },
  });

  if (sessions.length === 0) {
    return;
  }

  const sessionIds = sessions.map((session) => session.id);

  await prisma.$transaction([
    prisma.session.updateMany({
      where: { id: { in: sessionIds } },
      data: { revokedAt: now },
    }),
    prisma.refreshToken.updateMany({
      where: { sessionId: { in: sessionIds }, revokedAt: null },
      data: { revokedAt: now },
    }),
  ]);
}

export async function registerUser(input: {
  email: string;
  password: string;
  name: string;
  userAgent?: string;
  ipAddress?: string;
}): Promise<{
  user: { id: string; email: string; name: string };
  accessToken: string;
  refreshToken: string;
}> {
  const existing = await prisma.user.findUnique({
    where: { email: input.email.toLowerCase() },
  });

  if (existing) {
    throw new AuthError("Email is already registered", 409);
  }

  const bcrypt = await import("bcryptjs");
  const passwordHash = await bcrypt.hash(input.password, 12);

  const user = await prisma.user.create({
    data: {
      email: input.email.toLowerCase(),
      name: input.name,
      passwordHash,
    },
  });

  const { accessToken, refreshToken } = await createSessionWithTokens({
    userId: user.id,
    isPlatformAdmin: user.isPlatformAdmin,
    activeOrgId: null,
    role: null,
    userAgent: input.userAgent,
    ipAddress: input.ipAddress,
  });

  await record({
    orgId: null,
    userId: user.id,
    action: AuditAction.AUTH_REGISTER,
    entityType: "user",
    entityId: user.id,
    metadata: { email: user.email },
  });

  return {
    user: { id: user.id, email: user.email, name: user.name },
    accessToken,
    refreshToken,
  };
}

export async function loginUser(input: {
  email: string;
  password: string;
  userAgent?: string;
  ipAddress?: string;
}): Promise<{
  user: { id: string; email: string; name: string; isPlatformAdmin: boolean };
  accessToken: string;
  refreshToken: string;
  activeOrgId: string | null;
  role: OrgRole | null;
}> {
  const user = await prisma.user.findUnique({
    where: { email: input.email.toLowerCase() },
  });

  if (!user) {
    throw new AuthError("Invalid email or password", 401);
  }

  const bcrypt = await import("bcryptjs");
  const valid = await bcrypt.compare(input.password, user.passwordHash);
  if (!valid) {
    throw new AuthError("Invalid email or password", 401);
  }

  const { activeOrgId, role } = await getDefaultOrgContext(user.id);

  const { accessToken, refreshToken, sessionId } = await createSessionWithTokens({
    userId: user.id,
    isPlatformAdmin: user.isPlatformAdmin,
    activeOrgId,
    role,
    userAgent: input.userAgent,
    ipAddress: input.ipAddress,
  });

  await record({
    orgId: activeOrgId,
    userId: user.id,
    action: AuditAction.AUTH_LOGIN,
    entityType: "session",
    entityId: sessionId,
    metadata: { email: user.email },
  });

  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      isPlatformAdmin: user.isPlatformAdmin,
    },
    accessToken,
    refreshToken,
    activeOrgId,
    role,
  };
}

export async function refreshSession(input: {
  refreshToken: string;
  accessToken?: string;
}): Promise<{
  accessToken: string;
  refreshToken: string;
  auth: AuthContext;
}> {
  const tokenHash = hashRefreshToken(input.refreshToken);

  const existing = await prisma.refreshToken.findUnique({
    where: { tokenHash },
    include: {
      session: {
        include: {
          user: true,
        },
      },
    },
  });

  if (!existing) {
    throw new AuthError("Invalid refresh token", 401);
  }

  if (existing.revokedAt) {
    await revokeSession(existing.sessionId);
    throw new AuthError("Refresh token reuse detected", 401, "token_reuse");
  }

  const session = existing.session;
  const now = new Date();

  if (session.revokedAt || session.expiresAt < now) {
    throw new AuthError("Session expired", 401);
  }

  if (existing.expiresAt < now) {
    throw new AuthError("Refresh token expired", 401);
  }

  let activeOrgId: string | null = null;
  let role: OrgRole | null = null;

  // Prefer DB-backed session active org so switches sync across dashboards
  // even when a client still holds a stale access JWT.
  if (session.activeOrgId) {
    try {
      role = await verifyMembership(session.userId, session.activeOrgId);
      activeOrgId = session.activeOrgId;
    } catch {
      activeOrgId = null;
      role = null;
    }
  }

  if (!activeOrgId && input.accessToken) {
    const priorClaims = await verifyAccessTokenAllowExpired(input.accessToken);
    if (priorClaims && priorClaims.sid === session.id) {
      if (priorClaims.activeOrgId) {
        try {
          role = await verifyMembership(session.userId, priorClaims.activeOrgId);
          activeOrgId = priorClaims.activeOrgId;
        } catch {
          activeOrgId = null;
          role = null;
        }
      }
    }
  }

  if (!activeOrgId) {
    const defaultOrg = await getDefaultOrgContext(session.userId);
    activeOrgId = defaultOrg.activeOrgId;
    role = defaultOrg.role;
  }

  // Keep Session row in sync when we fall back to JWT/default.
  if (session.activeOrgId !== activeOrgId) {
    await prisma.session.update({
      where: { id: session.id },
      data: { activeOrgId },
    });
  }

  const newRefreshToken = createOpaqueRefreshToken();
  const newRefreshHash = hashRefreshToken(newRefreshToken);
  const refreshExpiresAt = getRefreshExpiry();

  await prisma.$transaction([
    prisma.refreshToken.update({
      where: { id: existing.id },
      data: { revokedAt: now },
    }),
    prisma.refreshToken.create({
      data: {
        sessionId: session.id,
        tokenHash: newRefreshHash,
        expiresAt: refreshExpiresAt,
      },
    }),
  ]);

  const accessToken = await signAccessToken({
    userId: session.userId,
    sessionId: session.id,
    activeOrgId,
    role,
    isPlatformAdmin: session.user.isPlatformAdmin,
  });

  return {
    accessToken,
    refreshToken: newRefreshToken,
    auth: {
      userId: session.userId,
      sessionId: session.id,
      activeOrgId,
      role,
      isPlatformAdmin: session.user.isPlatformAdmin,
    },
  };
}

export async function logoutSession(input: {
  sessionId: string;
  userId: string;
  activeOrgId: string | null;
}): Promise<void> {
  await revokeSession(input.sessionId);

  await record({
    orgId: input.activeOrgId,
    userId: input.userId,
    action: AuditAction.AUTH_LOGOUT,
    entityType: "session",
    entityId: input.sessionId,
  });
}

export async function logoutEverywhere(input: {
  userId: string;
  activeOrgId: string | null;
  currentSessionId?: string;
}): Promise<void> {
  await revokeAllUserSessions(input.userId);

  await record({
    orgId: input.activeOrgId,
    userId: input.userId,
    action: AuditAction.AUTH_LOGOUT_EVERYWHERE,
    entityType: "session",
    entityId: input.currentSessionId ?? input.userId,
  });
}

export async function switchOrg(input: {
  userId: string;
  sessionId: string;
  isPlatformAdmin: boolean;
  orgId: string;
}): Promise<{
  accessToken: string;
  activeOrgId: string;
  role: OrgRole;
}> {
  const role = await verifyMembership(input.userId, input.orgId);

  // Persist on all active sessions for this user so Hub/Console (or multiple
  // devices) see the same active org after reload — not just the JWT cookie.
  await prisma.session.updateMany({
    where: { userId: input.userId, revokedAt: null },
    data: { activeOrgId: input.orgId },
  });

  const accessToken = await signAccessToken({
    userId: input.userId,
    sessionId: input.sessionId,
    activeOrgId: input.orgId,
    role,
    isPlatformAdmin: input.isPlatformAdmin,
  });

  await record({
    orgId: input.orgId,
    userId: input.userId,
    action: AuditAction.AUTH_SWITCH_ORG,
    entityType: "session",
    entityId: input.sessionId,
    metadata: { role },
  });

  return {
    accessToken,
    activeOrgId: input.orgId,
    role,
  };
}

export async function getMe(userId: string, auth: AuthContext) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      isPlatformAdmin: true,
      createdAt: true,
    },
  });

  if (!user) {
    throw new AuthError("User not found", 404);
  }

  const memberships = await getAcceptedMemberships(userId);

  const activeOrg = auth.activeOrgId
    ? (memberships.find((membership) => membership.orgId === auth.activeOrgId) ?? null)
    : null;

  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      isPlatformAdmin: user.isPlatformAdmin,
      createdAt: user.createdAt.toISOString(),
    },
    memberships,
    activeOrg: activeOrg
      ? {
          orgId: activeOrg.orgId,
          orgName: activeOrg.orgName,
          orgSlug: activeOrg.orgSlug,
          role: activeOrg.role,
        }
      : null,
  };
}

export async function resolveAuthContext(claims: {
  sub: string;
  sid: string;
  activeOrgId: string | null;
  role: OrgRole | null;
  isPlatformAdmin: boolean;
}): Promise<AuthContext> {
  const session = await prisma.session.findUnique({
    where: { id: claims.sid },
    include: {
      user: {
        select: { isPlatformAdmin: true },
      },
    },
  });

  if (!session || session.userId !== claims.sub) {
    throw new AuthError("Invalid session", 401);
  }

  if (session.revokedAt || session.expiresAt < new Date()) {
    throw new AuthError("Session expired", 401);
  }

  const isPlatformAdmin = session.user.isPlatformAdmin;

  // Prefer Session.activeOrgId (source of truth after org switch) over JWT claim.
  const candidateOrgId = session.activeOrgId ?? claims.activeOrgId;

  if (candidateOrgId) {
    try {
      const role = await verifyMembership(claims.sub, candidateOrgId);
      return {
        userId: claims.sub,
        sessionId: claims.sid,
        activeOrgId: candidateOrgId,
        role,
        isPlatformAdmin,
      };
    } catch (error) {
      if (!(error instanceof AuthError) || error.statusCode !== 403) {
        throw error;
      }
      // Membership lost — clear active org, but retain stale id for
      // resource-by-id routes (share resolvers return 404, not no_active_org).
      return {
        userId: claims.sub,
        sessionId: claims.sid,
        activeOrgId: null,
        role: null,
        isPlatformAdmin,
        staleActiveOrgId: candidateOrgId,
      };
    }
  }

  return {
    userId: claims.sub,
    sessionId: claims.sid,
    activeOrgId: null,
    role: null,
    isPlatformAdmin,
  };
}
