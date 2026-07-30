import { SignJWT } from "jose";
import { afterEach, describe, expect, it, vi } from "vitest";
import { env } from "../../../lib/env.js";
import {
  createOpaqueRefreshToken,
  hashRefreshToken,
  signAccessToken,
  verifyAccessToken,
} from "./tokens.js";

const jwtSecret = new TextEncoder().encode(env.jwtSecret);

describe("tokens", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("round-trips access token claims", async () => {
    const token = await signAccessToken({
      userId: "user-1",
      sessionId: "session-1",
      activeOrgId: "org-1",
      role: "ORG_ADMIN",
      isPlatformAdmin: false,
    });

    const claims = await verifyAccessToken(token);
    expect(claims.sub).toBe("user-1");
    expect(claims.sid).toBe("session-1");
    expect(claims.activeOrgId).toBe("org-1");
    expect(claims.role).toBe("ORG_ADMIN");
    expect(claims.isPlatformAdmin).toBe(false);
    expect(claims.jti).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });

  it("issues unique jti values", async () => {
    const first = await signAccessToken({
      userId: "u",
      sessionId: "s",
      activeOrgId: null,
      role: null,
      isPlatformAdmin: false,
    });
    const second = await signAccessToken({
      userId: "u",
      sessionId: "s",
      activeOrgId: null,
      role: null,
      isPlatformAdmin: false,
    });

    const a = await verifyAccessToken(first);
    const b = await verifyAccessToken(second);
    expect(a.jti).not.toBe(b.jti);
  });

  it("sets exp - iat to 900 seconds", async () => {
    const token = await signAccessToken({
      userId: "u",
      sessionId: "s",
      activeOrgId: null,
      role: null,
      isPlatformAdmin: false,
    });

    const [, payload] = token.split(".");
    const decoded = JSON.parse(Buffer.from(payload!, "base64url").toString("utf8")) as {
      iat: number;
      exp: number;
    };

    expect(decoded.exp - decoded.iat).toBe(900);
  });

  it("rejects alg none", async () => {
    const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
    const payload = Buffer.from(
      JSON.stringify({
        sub: "u",
        sid: "s",
        jti: "j",
        activeOrgId: null,
        role: null,
        isPlatformAdmin: false,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 900,
      }),
    ).toString("base64url");

    await expect(verifyAccessToken(`${header}.${payload}.`)).rejects.toThrow();
  });

  it("rejects token signed with a different secret", async () => {
    const wrongSecret = new TextEncoder().encode("wrong-secret-at-least-32-characters!!");
    const token = await new SignJWT({
      jti: crypto.randomUUID(),
      sid: "s",
      activeOrgId: null,
      role: null,
      isPlatformAdmin: false,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("u")
      .setIssuedAt()
      .setExpirationTime("900s")
      .sign(wrongSecret);

    await expect(verifyAccessToken(token)).rejects.toThrow();
  });

  it("rejects tampered payload", async () => {
    const token = await signAccessToken({
      userId: "u",
      sessionId: "s",
      activeOrgId: null,
      role: null,
      isPlatformAdmin: false,
    });

    const parts = token.split(".");
    const payload = JSON.parse(Buffer.from(parts[1]!, "base64url").toString("utf8")) as Record<
      string,
      unknown
    >;
    payload.isPlatformAdmin = true;
    const tamperedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");

    await expect(verifyAccessToken(`${parts[0]}.${tamperedPayload}.${parts[2]}`)).rejects.toThrow();
  });

  it("rejects expired tokens", async () => {
    vi.useFakeTimers();
    const now = new Date("2026-01-01T00:00:00Z");
    vi.setSystemTime(now);

    const token = await signAccessToken({
      userId: "u",
      sessionId: "s",
      activeOrgId: null,
      role: null,
      isPlatformAdmin: false,
    });

    vi.setSystemTime(new Date(now.getTime() + 901_000));
    await expect(verifyAccessToken(token)).rejects.toThrow();
  });

  it("rejects missing sub or sid", async () => {
    const token = await new SignJWT({
      jti: crypto.randomUUID(),
      activeOrgId: null,
      role: null,
      isPlatformAdmin: false,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("900s")
      .sign(jwtSecret);

    await expect(verifyAccessToken(token)).rejects.toThrow("Invalid access token claims");
  });

  it("hashRefreshToken is stable SHA-256 hex", () => {
    const value = hashRefreshToken("opaque-token");
    expect(value).toMatch(/^[a-f0-9]{64}$/);
    expect(hashRefreshToken("opaque-token")).toBe(value);
  });

  it("createOpaqueRefreshToken yields 43-char base64url strings", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 1000; i += 1) {
      const token = createOpaqueRefreshToken();
      expect(token).toHaveLength(43);
      expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
      seen.add(token);
    }
    expect(seen.size).toBe(1000);
  });
});
