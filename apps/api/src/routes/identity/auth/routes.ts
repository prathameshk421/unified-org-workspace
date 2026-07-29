import { Router, type Router as RouterType } from "express";
import type { Request, Response } from "express";
import { ZodError } from "zod";
import {
  clearAuthCookies,
  setAccessCookie,
  setAuthCookies,
} from "./cookies.js";
import {
  getClientMeta,
  getRefreshToken,
  requireAuth,
  requireJsonContentType,
} from "./middleware.js";
import { createRateLimiter } from "./rateLimit.js";
import {
  loginSchema,
  registerSchema,
  switchOrgSchema,
} from "./schemas.js";
import {
  AuthError,
  getMe,
  loginUser,
  logoutEverywhere,
  logoutSession,
  refreshSession,
  registerUser,
  switchOrg,
} from "./service.js";
import { env } from "../../../lib/env.js";
import { markAuditWritten } from "../../../middleware/audit-mutations.js";

const router: RouterType = Router();
const authRateLimit = createRateLimiter("auth");
const refreshRateLimit = createRateLimiter("auth:refresh");

function handleAuthError(res: Response, error: unknown): void {
  if (error instanceof ZodError) {
    res.status(400).json({
      error: "Validation failed",
      details: error.flatten().fieldErrors,
    });
    return;
  }

  if (error instanceof AuthError) {
    if (error.code === "token_reuse") {
      clearAuthCookies(res);
    }
    res.status(error.statusCode).json({ error: error.message, code: error.code });
    return;
  }

  console.error(error);
  res.status(500).json({ error: "Internal server error" });
}

router.post(
  "/register",
  requireJsonContentType,
  authRateLimit,
  async (req: Request, res: Response) => {
    try {
      const body = registerSchema.parse(req.body);
      const meta = getClientMeta(req);
      const result = await registerUser({ ...body, ...meta });
      setAuthCookies(res, result.accessToken, result.refreshToken);
      markAuditWritten(res);
      res.status(201).json({ user: result.user });
    } catch (error) {
      handleAuthError(res, error);
    }
  },
);

router.post(
  "/login",
  requireJsonContentType,
  authRateLimit,
  async (req: Request, res: Response) => {
    try {
      const body = loginSchema.parse(req.body);
      const meta = getClientMeta(req);
      const result = await loginUser({ ...body, ...meta });
      setAuthCookies(res, result.accessToken, result.refreshToken);
      markAuditWritten(res);
      res.json({
        user: result.user,
        activeOrg: result.activeOrgId
          ? { orgId: result.activeOrgId, role: result.role }
          : null,
      });
    } catch (error) {
      handleAuthError(res, error);
    }
  },
);

router.post(
  "/refresh",
  requireJsonContentType,
  refreshRateLimit,
  async (req: Request, res: Response) => {
    try {
      const refreshToken = getRefreshToken(req);
      if (!refreshToken) {
        res.status(401).json({ error: "Refresh token required" });
        return;
      }

      const accessToken = req.cookies?.[env.accessCookieName] as
        | string
        | undefined;
      const result = await refreshSession({ refreshToken, accessToken });
      setAuthCookies(res, result.accessToken, result.refreshToken);
      res.json({ ok: true });
    } catch (error) {
      handleAuthError(res, error);
    }
  },
);

router.post(
  "/logout",
  requireJsonContentType,
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const auth = req.auth!;
      await logoutSession({
        sessionId: auth.sessionId,
        userId: auth.userId,
        activeOrgId: auth.activeOrgId,
      });
      markAuditWritten(res);
      clearAuthCookies(res);
      res.json({ ok: true });
    } catch (error) {
      handleAuthError(res, error);
    }
  },
);

router.post(
  "/logout-everywhere",
  requireJsonContentType,
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const auth = req.auth!;
      await logoutEverywhere({
        userId: auth.userId,
        activeOrgId: auth.activeOrgId,
        currentSessionId: auth.sessionId,
      });
      markAuditWritten(res);
      clearAuthCookies(res);
      res.json({ ok: true });
    } catch (error) {
      handleAuthError(res, error);
    }
  },
);

router.get("/me", requireAuth, async (req: Request, res: Response) => {
  try {
    const auth = req.auth!;
    const me = await getMe(auth.userId, auth);
    res.setHeader("Cache-Control", "no-store");
    res.json(me);
  } catch (error) {
    handleAuthError(res, error);
  }
});

router.post(
  "/switch-org",
  requireJsonContentType,
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const auth = req.auth!;
      const body = switchOrgSchema.parse(req.body);
      const result = await switchOrg({
        userId: auth.userId,
        sessionId: auth.sessionId,
        isPlatformAdmin: auth.isPlatformAdmin,
        orgId: body.orgId,
      });
      setAccessCookie(res, result.accessToken);
      markAuditWritten(res);
      res.json({
        activeOrg: {
          orgId: result.activeOrgId,
          role: result.role,
        },
      });
    } catch (error) {
      handleAuthError(res, error);
    }
  },
);

export { router as authRouter };
