import type { CookieOptions, Response } from "express";
import { env } from "../../../lib/env.js";

function baseCookieOptions(maxAgeMs: number): CookieOptions {
  const options: CookieOptions = {
    httpOnly: true,
    secure: env.cookieSecure,
    sameSite: "strict",
    path: "/",
    maxAge: maxAgeMs,
  };

  if (env.cookieDomain) {
    options.domain = env.cookieDomain;
  }

  return options;
}

const accessMaxAgeMs = env.accessTokenTtlSeconds * 1000;
const refreshMaxAgeMs = env.refreshTokenDays * 24 * 60 * 60 * 1000;

export function setAuthCookies(
  res: Response,
  accessToken: string,
  refreshToken: string,
): void {
  res.cookie(
    env.accessCookieName,
    accessToken,
    baseCookieOptions(accessMaxAgeMs),
  );
  res.cookie(
    env.refreshCookieName,
    refreshToken,
    baseCookieOptions(refreshMaxAgeMs),
  );
}

export function setAccessCookie(res: Response, accessToken: string): void {
  res.cookie(
    env.accessCookieName,
    accessToken,
    baseCookieOptions(accessMaxAgeMs),
  );
}

export function clearAuthCookies(res: Response): void {
  const clearOptions: CookieOptions = {
    httpOnly: true,
    secure: env.cookieSecure,
    sameSite: "strict",
    path: "/",
  };

  if (env.cookieDomain) {
    clearOptions.domain = env.cookieDomain;
  }

  res.clearCookie(env.accessCookieName, clearOptions);
  res.clearCookie(env.refreshCookieName, clearOptions);
}
