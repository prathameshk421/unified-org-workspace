import type { NextFunction, Request, Response } from "express";
import { env } from "../../../lib/env.js";
import { AuthError, resolveAuthContext } from "./service.js";
import { verifyAccessToken } from "./tokens.js";

function getAccessToken(req: Request): string | undefined {
  return req.cookies?.[env.accessCookieName] as string | undefined;
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
