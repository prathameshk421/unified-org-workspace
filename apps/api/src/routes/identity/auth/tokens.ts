import { createHash, randomBytes, randomUUID } from "node:crypto";
import { SignJWT, decodeJwt, jwtVerify } from "jose";
import type { OrgRole } from "@unified/types";
import { env } from "../../../lib/env.js";
import type { AccessTokenClaims } from "./types.js";

const jwtSecret = new TextEncoder().encode(env.jwtSecret);

export function hashRefreshToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function createOpaqueRefreshToken(): string {
  return randomBytes(32).toString("base64url");
}

export function getRefreshExpiry(): Date {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + env.refreshTokenDays);
  return expiresAt;
}

export function getSessionExpiry(): Date {
  return getRefreshExpiry();
}

export async function signAccessToken(input: {
  userId: string;
  sessionId: string;
  activeOrgId: string | null;
  role: OrgRole | null;
  isPlatformAdmin: boolean;
}): Promise<string> {
  const claims: AccessTokenClaims = {
    sub: input.userId,
    sid: input.sessionId,
    jti: randomUUID(),
    activeOrgId: input.activeOrgId,
    role: input.role,
    isPlatformAdmin: input.isPlatformAdmin,
  };

  return new SignJWT({ ...claims })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${env.accessTokenTtlSeconds}s`)
    .sign(jwtSecret);
}

export async function verifyAccessToken(token: string): Promise<AccessTokenClaims> {
  const { payload } = await jwtVerify(token, jwtSecret, {
    algorithms: ["HS256"],
  });

  return parseAccessPayload(payload);
}

/** Verify signature on an expired access token to recover org context on refresh. */
export async function verifyAccessTokenAllowExpired(
  token: string,
): Promise<AccessTokenClaims | null> {
  try {
    const claims = decodeJwt(token);
    const exp = claims.exp;
    if (typeof exp !== "number") {
      return null;
    }

    const { payload } = await jwtVerify(token, jwtSecret, {
      algorithms: ["HS256"],
      currentDate: new Date(exp * 1000),
    });

    return parseAccessPayload(payload);
  } catch {
    return null;
  }
}

function parseAccessPayload(payload: Record<string, unknown>): AccessTokenClaims {
  const sub = payload.sub;
  const sid = payload.sid;
  const jti = payload.jti;

  if (typeof sub !== "string" || typeof sid !== "string" || typeof jti !== "string") {
    throw new Error("Invalid access token claims");
  }

  return {
    sub,
    sid,
    jti,
    activeOrgId: typeof payload.activeOrgId === "string" ? payload.activeOrgId : null,
    role: typeof payload.role === "string" ? (payload.role as OrgRole) : null,
    isPlatformAdmin: payload.isPlatformAdmin === true,
  };
}
