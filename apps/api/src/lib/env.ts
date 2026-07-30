import "./load-env.js";
import path from "node:path";
import {
  ATTACHMENT_MAX_BYTES,
  ATTACHMENT_MAX_PER_TICKET,
} from "@unified/types";

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function positiveIntEnv(key: string, fallback: number): number {
  const raw = process.env[key];
  const parsed = raw === undefined ? NaN : Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const jwtSecret = requireEnv("JWT_SECRET");
if (jwtSecret.length < 32) {
  throw new Error("JWT_SECRET must be at least 32 characters");
}

const corsOrigins = (
  process.env.CORS_ORIGINS ?? "http://localhost:3000,http://localhost:3001"
)
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

export const env = {
  jwtSecret,
  databaseAppUrl: requireEnv("DATABASE_APP_URL"),
  accessCookieName: process.env.ACCESS_COOKIE_NAME ?? "unified_access",
  refreshCookieName: process.env.REFRESH_COOKIE_NAME ?? "unified_refresh",
  cookieDomain: process.env.COOKIE_DOMAIN || undefined,
  cookieSecure:
    process.env.COOKIE_SECURE === "true"
      ? true
      : process.env.COOKIE_SECURE === "false"
        ? false
        : process.env.NODE_ENV === "production",
  corsOrigins,
  accessTokenTtlSeconds: 15 * 60,
  refreshTokenDays: 7,
  bcryptRounds: 12,
  authRateLimitMax: positiveIntEnv("AUTH_RATE_LIMIT_MAX", 10),
  authRateLimitWindowMs: positiveIntEnv("AUTH_RATE_LIMIT_WINDOW_MS", 60_000),
  attachmentsDir:
    process.env.ATTACHMENTS_DIR ??
    path.join(process.cwd(), "data", "attachments"),
  attachmentMaxBytes: ATTACHMENT_MAX_BYTES,
  attachmentMaxPerTicket: ATTACHMENT_MAX_PER_TICKET,
} as const;
