import type { NextFunction, Request, Response } from "express";
import { OrgRole } from "@unified/types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthContext } from "./types.js";

vi.mock("./service.js", () => ({
  AuthError: class AuthError extends Error {
    statusCode: number;
    constructor(message: string, statusCode: number) {
      super(message);
      this.statusCode = statusCode;
    }
  },
  resolveAuthContext: vi.fn(),
}));

vi.mock("./tokens.js", () => ({
  verifyAccessToken: vi.fn(),
}));

import {
  requireAuth,
  requireJsonContentType,
  requireOrgAccess,
  requirePlatformAdmin,
  requireRole,
} from "./middleware.js";
import { resolveAuthContext } from "./service.js";
import { verifyAccessToken } from "./tokens.js";

function mockReq(overrides: Partial<Request> = {}): Request {
  return {
    cookies: {},
    get: vi.fn(),
    query: {},
    body: {},
    ...overrides,
  } as unknown as Request;
}

function mockRes() {
  const res = {
    statusCode: 200,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;
  return res;
}

describe("auth middleware", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requireOrgAccess returns no_active_org when activeOrgId is null", async () => {
    const req = mockReq({
      auth: {
        userId: "u",
        sessionId: "s",
        activeOrgId: null,
        role: null,
        isPlatformAdmin: false,
      },
    });
    const res = mockRes();
    const next = vi.fn() as NextFunction;

    requireOrgAccess(req, res, next);

    expect(res.statusCode).toBe(403);
    expect(res.json).toHaveBeenCalledWith({
      error: "No active organization",
      code: "no_active_org",
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("requireRole returns insufficient_role", () => {
    const req = mockReq({
      auth: {
        userId: "u",
        sessionId: "s",
        activeOrgId: "org",
        role: OrgRole.SUPPORT_AGENT,
        isPlatformAdmin: false,
      },
    });
    const res = mockRes();
    const next = vi.fn() as NextFunction;

    requireRole(OrgRole.ORG_ADMIN)(req, res, next);

    expect(res.statusCode).toBe(403);
    expect(res.json).toHaveBeenCalledWith({
      error: "Insufficient role",
      code: "insufficient_role",
    });
  });

  it("requirePlatformAdmin returns platform_admin_required", () => {
    const req = mockReq({
      auth: {
        userId: "u",
        sessionId: "s",
        activeOrgId: null,
        role: null,
        isPlatformAdmin: false,
      },
    });
    const res = mockRes();
    const next = vi.fn() as NextFunction;

    requirePlatformAdmin(req, res, next);

    expect(res.statusCode).toBe(403);
    expect(res.json).toHaveBeenCalledWith({
      error: "Platform admin required",
      code: "platform_admin_required",
    });
  });

  it("requireOrgAccess sets req.orgId from session auth, ignoring client orgId", () => {
    const req = mockReq({
      auth: {
        userId: "u",
        sessionId: "s",
        activeOrgId: "session-org",
        role: OrgRole.ORG_ADMIN,
        isPlatformAdmin: false,
      },
      query: { orgId: "evil-org" },
      body: { orgId: "evil-org" },
    });
    const res = mockRes();
    const next = vi.fn() as NextFunction;

    requireOrgAccess(req, res, next);

    expect(req.orgId).toBe("session-org");
    expect(next).toHaveBeenCalled();
  });

  it("requireJsonContentType accepts application/json with charset", () => {
    const req = mockReq({
      get: vi.fn().mockReturnValue("application/json; charset=utf-8"),
    });
    const res = mockRes();
    const next = vi.fn() as NextFunction;

    requireJsonContentType(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it("requireJsonContentType rejects text/plain with 415", () => {
    const req = mockReq({
      get: vi.fn().mockReturnValue("text/plain"),
    });
    const res = mockRes();
    const next = vi.fn() as NextFunction;

    requireJsonContentType(req, res, next);

    expect(res.statusCode).toBe(415);
    expect(res.json).toHaveBeenCalledWith({
      error: "Content-Type must be application/json",
      code: "unsupported_media_type",
    });
  });

  it("requireAuth resolves auth context from access token", async () => {
    const auth: AuthContext = {
      userId: "u",
      sessionId: "s",
      activeOrgId: "org",
      role: OrgRole.ORG_ADMIN,
      isPlatformAdmin: false,
    };

    vi.mocked(verifyAccessToken).mockResolvedValue({
      sub: "u",
      sid: "s",
      jti: "j",
      activeOrgId: "org",
      role: OrgRole.ORG_ADMIN,
      isPlatformAdmin: false,
    });
    vi.mocked(resolveAuthContext).mockResolvedValue(auth);

    const req = mockReq({
      cookies: { unified_access: "token" },
    });
    const res = mockRes();
    const next = vi.fn() as NextFunction;

    await requireAuth(req, res, next);

    expect(req.auth).toEqual(auth);
    expect(next).toHaveBeenCalled();
  });
});
