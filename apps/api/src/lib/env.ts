function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
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
    process.env.COOKIE_SECURE === "true" ||
    process.env.NODE_ENV === "production",
  corsOrigins,
  accessTokenTtlSeconds: 15 * 60,
  refreshTokenDays: 7,
  bcryptRounds: 12,
} as const;
