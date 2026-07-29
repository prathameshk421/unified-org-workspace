import type { NextFunction, Request, Response } from "express";
import type { OrgRole } from "@unified/types";
import { env } from "../../../lib/env.js";
import { AuthError, resolveAuthContext } from "./service.js";
import { verifyAccessToken } from "./tokens.js";

function getAccessToken(req: Request): string | undefined {
  return req.cookies?.[env.accessCookieName] as string | undefined;
}

function requireAuthenticated(
  req: Request,
  res: Response,
): req is Request & { auth: NonNullable<Request["auth"]> } {
  if (!req.auth) {
    res.status(401).json({ error: "Authentication required" });
    return false;
  }

  return true;
}

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const token = getAccessToken(req);
    if (!token) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    const claims = await verifyAccessToken(token);
    req.auth = await resolveAuthContext(claims);
    next();
  } catch (error) {
    if (error instanceof AuthError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }

    res.status(401).json({ error: "Invalid or expired access token" });
  }
}

/**
 * BOLA gate for org-scoped resource routes.
 * Sets `req.orgId` from verified session/JWT only — never from client input.
 * Do not attach to /auth/me or /auth/switch-org (null org is valid there).
 */
export function requireOrgAccess(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!requireAuthenticated(req, res)) {
    return;
  }

  if (!req.auth.activeOrgId) {
    res.status(403).json({
      error: "No active organization",
      code: "no_active_org",
    });
    return;
  }

  req.orgId = req.auth.activeOrgId;
  next();
}

/** Alias of `requireOrgAccess` (session-sync doc compatibility). */
export const requireActiveOrg = requireOrgAccess;

export function requireRole(...roles: OrgRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!requireAuthenticated(req, res)) {
      return;
    }

    if (!req.auth.role || !roles.includes(req.auth.role)) {
      res.status(403).json({
        error: "Insufficient role",
        code: "insufficient_role",
      });
      return;
    }

    next();
  };
}

export function requirePlatformAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!requireAuthenticated(req, res)) {
    return;
  }

  if (!req.auth.isPlatformAdmin) {
    res.status(403).json({
      error: "Platform admin required",
      code: "platform_admin_required",
    });
    return;
  }

  next();
}

/**
 * CSRF mitigation for SameSite=None (*.run.app): reject non-JSON mutating bodies
 * so simple cross-site form posts cannot hit auth state-changing routes.
 */
export function requireJsonContentType(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const contentType = req.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    res.status(415).json({
      error: "Content-Type must be application/json",
      code: "unsupported_media_type",
    });
    return;
  }
  next();
}

export function getRefreshToken(req: Request): string | undefined {
  return req.cookies?.[env.refreshCookieName] as string | undefined;
}

export function getClientMeta(req: Request): {
  userAgent?: string;
  ipAddress?: string;
} {
  return {
    userAgent: req.get("user-agent") ?? undefined,
    ipAddress: req.ip ?? req.socket.remoteAddress ?? undefined,
  };
}
