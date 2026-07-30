import type { NextFunction, Request, Response } from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const RATE_LIMIT_ENV = {
  JWT_SECRET: "test-only-secret-min-32-characters-long!!",
  DATABASE_APP_URL: "postgresql://unified_app:unified_app@localhost:5432/unified_org",
  AUTH_RATE_LIMIT_MAX: "10",
  AUTH_RATE_LIMIT_WINDOW_MS: "60000",
} as const;

async function loadRateLimiter() {
  vi.resetModules();
  for (const [key, value] of Object.entries(RATE_LIMIT_ENV)) {
    vi.stubEnv(key, value);
  }

  return import("./rateLimit.js");
}

function mockReqRes(body: Record<string, unknown> = {}) {
  const req = {
    body,
    ip: "127.0.0.1",
    socket: { remoteAddress: "127.0.0.1" },
  } as Request;

  const res = {
    statusCode: 200,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;

  const next = vi.fn() as NextFunction;

  return { req, res, next };
}

describe("createRateLimiter", () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    const { resetRateLimitBucketsForTests } = await loadRateLimiter();
    resetRateLimitBucketsForTests();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.resetModules();
  });

  it("allows exactly MAX requests then returns 429", async () => {
    const { createRateLimiter } = await loadRateLimiter();
    const limiter = createRateLimiter("auth");
    const { req, res, next } = mockReqRes();

    for (let i = 0; i < 10; i += 1) {
      limiter(req, res, next);
      expect(next).toHaveBeenCalledTimes(i + 1);
    }

    limiter(req, res, next);
    expect(res.statusCode).toBe(429);
    expect(res.json).toHaveBeenCalledWith({
      error: "Too many requests. Try again later.",
    });
    expect(next).toHaveBeenCalledTimes(10);
  });

  it("resets the window after WINDOW_MS", async () => {
    const { createRateLimiter } = await loadRateLimiter();
    const limiter = createRateLimiter("auth");
    const { req, res, next } = mockReqRes();

    for (let i = 0; i < 10; i += 1) {
      limiter(req, res, next);
    }

    vi.advanceTimersByTime(60_001);

    limiter(req, res, next);
    expect(next).toHaveBeenCalledTimes(11);
    expect(res.statusCode).toBe(200);
  });

  it("uses independent buckets per scope", async () => {
    const { createRateLimiter } = await loadRateLimiter();
    const authLimiter = createRateLimiter("auth");
    const refreshLimiter = createRateLimiter("auth:refresh");
    const { req, res, next } = mockReqRes();

    for (let i = 0; i < 10; i += 1) {
      authLimiter(req, res, next);
    }

    refreshLimiter(req, res, next);
    expect(next).toHaveBeenCalledTimes(11);
  });

  it("keys login attempts by email", async () => {
    const { createRateLimiter } = await loadRateLimiter();
    const limiter = createRateLimiter("auth");
    const alice = mockReqRes({ email: "alice@example.com" });
    const bob = mockReqRes({ email: "bob@example.com" });

    for (let i = 0; i < 10; i += 1) {
      limiter(alice.req, alice.res, alice.next);
    }

    limiter(alice.req, alice.res, alice.next);
    expect(alice.res.statusCode).toBe(429);

    limiter(bob.req, bob.res, bob.next);
    expect(bob.next).toHaveBeenCalledTimes(1);
  });

  it("falls back to socket.remoteAddress when req.ip is missing", async () => {
    const { createRateLimiter } = await loadRateLimiter();
    const limiter = createRateLimiter("auth");
    const { req, res, next } = mockReqRes();
    (req as { ip?: string }).ip = undefined;
    req.socket.remoteAddress = "10.0.0.5";

    limiter(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
  });
});

describe("auth rate limit env parsing", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it.each([
    ["unset", undefined, 10],
    ["empty", "", 10],
    ["zero", "0", 10],
    ["negative", "-5", 10],
    ["invalid", "abc", 10],
    ["valid", "25", 25],
  ])("AUTH_RATE_LIMIT_MAX %s -> %s", async (_label, value, expected) => {
    vi.resetModules();
    process.env.JWT_SECRET = "test-only-secret-min-32-characters-long!!";
    process.env.DATABASE_APP_URL =
      "postgresql://unified_app:unified_app@localhost:5432/unified_org";

    if (value === undefined) {
      delete process.env.AUTH_RATE_LIMIT_MAX;
    } else {
      process.env.AUTH_RATE_LIMIT_MAX = value;
    }

    const { env } = await import("../../../lib/env.js");
    expect(env.authRateLimitMax).toBe(expected);
  });
});
