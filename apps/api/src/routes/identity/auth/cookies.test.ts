import type { Response } from "express";
import { afterEach, describe, expect, it, vi } from "vitest";

function mockResponse() {
  const cookies: Array<{ name: string; value: string; options: Record<string, unknown> }> = [];

  const res = {
    cookie(name: string, value: string, options: Record<string, unknown>) {
      cookies.push({ name, value, options });
      return this;
    },
    clearCookie(name: string, options: Record<string, unknown>) {
      cookies.push({ name, value: "", options: { ...options, clear: true } });
      return this;
    },
  } as unknown as Response;

  return { res, cookies };
}

describe("auth cookies", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  async function loadCookieModule() {
    process.env.JWT_SECRET = "test-only-secret-min-32-characters-long!!";
    process.env.DATABASE_APP_URL =
      "postgresql://unified_app:unified_app@localhost:5432/unified_org";
    vi.resetModules();
    return import("./cookies.js");
  }

  it("sets httpOnly and path / on auth cookies", async () => {
    const { setAuthCookies } = await loadCookieModule();
    const { res, cookies } = mockResponse();

    setAuthCookies(res, "access", "refresh");

    for (const cookie of cookies) {
      expect(cookie.options.httpOnly).toBe(true);
      expect(cookie.options.path).toBe("/");
    }
  });

  it("sets access maxAge to 900000ms and refresh to 7 days", async () => {
    const { setAuthCookies } = await loadCookieModule();
    const { res, cookies } = mockResponse();

    setAuthCookies(res, "access", "refresh");

    const access = cookies.find((cookie) => cookie.name === "unified_access");
    const refresh = cookies.find((cookie) => cookie.name === "unified_refresh");

    expect(access?.options.maxAge).toBe(900_000);
    expect(refresh?.options.maxAge).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it.each([
    {
      label: "localhost insecure",
      env: { COOKIE_SECURE: "false", COOKIE_DOMAIN: "" },
      expected: { secure: false, sameSite: "strict", domain: undefined },
    },
    {
      label: "production secure no domain",
      env: { COOKIE_SECURE: "true", COOKIE_DOMAIN: "" },
      expected: { secure: true, sameSite: "none", domain: undefined },
    },
    {
      label: "custom domain",
      env: { COOKIE_SECURE: "true", COOKIE_DOMAIN: ".example.com" },
      expected: {
        secure: true,
        sameSite: "strict",
        domain: ".example.com",
      },
    },
  ])("cookie matrix: $label", async ({ env: envVars, expected }) => {
    process.env.JWT_SECRET = "test-only-secret-min-32-characters-long!!";
    process.env.DATABASE_APP_URL =
      "postgresql://unified_app:unified_app@localhost:5432/unified_org";
    process.env.COOKIE_SECURE = envVars.COOKIE_SECURE;
    if (envVars.COOKIE_DOMAIN) {
      process.env.COOKIE_DOMAIN = envVars.COOKIE_DOMAIN;
    } else {
      delete process.env.COOKIE_DOMAIN;
    }

    const { setAccessCookie } = await loadCookieModule();
    const { res, cookies } = mockResponse();
    setAccessCookie(res, "token");

    const cookie = cookies[0]!;
    expect(cookie.options.secure).toBe(expected.secure);
    expect(cookie.options.sameSite).toBe(expected.sameSite);
    expect(cookie.options.domain).toBe(expected.domain);
  });

  it("clearAuthCookies mirrors set attributes exactly", async () => {
    const { setAuthCookies, clearAuthCookies } = await loadCookieModule();
    const { res, cookies } = mockResponse();

    setAuthCookies(res, "access", "refresh");
    const setOptions = cookies.map((cookie) => ({
      name: cookie.name,
      options: cookie.options,
    }));

    clearAuthCookies(res);
    const clearOptions = cookies
      .filter((cookie) => cookie.options.clear)
      .map((cookie) => ({
        name: cookie.name,
        options: cookie.options,
      }));

    expect(clearOptions).toHaveLength(2);
    for (const cleared of clearOptions) {
      const original = setOptions.find((item) => item.name === cleared.name);
      expect(original).toBeDefined();
      expect(cleared.options.httpOnly).toBe(original!.options.httpOnly);
      expect(cleared.options.secure).toBe(original!.options.secure);
      expect(cleared.options.sameSite).toBe(original!.options.sameSite);
      expect(cleared.options.path).toBe(original!.options.path);
      expect(cleared.options.domain).toBe(original!.options.domain);
    }
  });
});
