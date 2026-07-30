import type { CookieOptions, Response } from "express";
import { env } from "../../../lib/env.js";

/**
 * Cookie SameSite matrix:
 * - COOKIE_DOMAIN set (custom parent domain) → strict (same-site subdomains)
 * - no domain + secure (*.run.app production) → none (cross-site credentialed fetch)
 * - no domain + !secure (localhost) → strict (schemeful same-site across ports)
 */
function resolveSameSite(): "strict" | "none" {
  if (env.cookieDomain) return "strict";
  if (env.cookieSecure) return "none";
  return "strict";
}

function cookieOptions(maxAgeMs?: number): CookieOptions {
  const options: CookieOptions = {
    httpOnly: true,
    secure: env.cookieSecure,
    sameSite: resolveSameSite(),
    path: "/",
  };

  if (maxAgeMs !== undefined) {
    options.maxAge = maxAgeMs;
  }

  if (env.cookieDomain) {
    options.domain = env.cookieDomain;
  }

  return options;
}

const accessMaxAgeMs = env.accessTokenTtlSeconds * 1000;
const refreshMaxAgeMs = env.refreshTokenDays * 24 * 60 * 60 * 1000;

export function setAuthCookies(res: Response, accessToken: string, refreshToken: string): void {
  res.cookie(env.accessCookieName, accessToken, cookieOptions(accessMaxAgeMs));
  res.cookie(env.refreshCookieName, refreshToken, cookieOptions(refreshMaxAgeMs));
}

export function setAccessCookie(res: Response, accessToken: string): void {
  res.cookie(env.accessCookieName, accessToken, cookieOptions(accessMaxAgeMs));
}

export function clearAuthCookies(res: Response): void {
  // Must mirror set attributes exactly or browsers leave zombie cookies.
  const clearOptions = cookieOptions();
  res.clearCookie(env.accessCookieName, clearOptions);
  res.clearCookie(env.refreshCookieName, clearOptions);
}
