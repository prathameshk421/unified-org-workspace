function optionalEnv(key: string): string | undefined {
  const value = process.env[key]?.trim();
  return value ? value : undefined;
}

function boolEnv(key: string, fallback: boolean): boolean {
  const raw = process.env[key]?.trim().toLowerCase();
  if (raw === "true" || raw === "1") return true;
  if (raw === "false" || raw === "0") return false;
  return fallback;
}

function positiveIntEnv(key: string, fallback: number): number {
  const raw = process.env[key];
  const parsed = raw === undefined ? NaN : Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseAllowlist(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/** Default Argus From header — locked brand. */
export const DEFAULT_SMTP_FROM =
  "Argus <argus.unified.workspace@gmail.com>";

/**
 * Worker-safe env — does not require JWT_SECRET.
 * Import load-env before reading process.env in the worker entrypoint.
 * Email settings are optional; never requireEnv.
 */
export const digestEnv = {
  enabled: boolEnv("DIGEST_ENABLED", false),
  llmEnabled: boolEnv("DIGEST_LLM_ENABLED", Boolean(optionalEnv("GROQ_API_KEY"))),
  groqApiKey: optionalEnv("GROQ_API_KEY"),
  groqModel: optionalEnv("GROQ_MODEL") ?? "openai/gpt-oss-20b",
  llmTimeoutMs: positiveIntEnv("DIGEST_LLM_TIMEOUT_MS", 8_000),
  ticketStaleDays: positiveIntEnv("DIGEST_TICKET_STALE_DAYS", 3),
  prIdleDays: positiveIntEnv("DIGEST_PR_IDLE_DAYS", 3),
  maxUsersPerRun: positiveIntEnv("DIGEST_MAX_USERS_PER_RUN", 10_000),
  /** Hours between digest run buckets (UTC). Default 3. */
  intervalHours: positiveIntEnv("DIGEST_INTERVAL_HOURS", 3),
  /** Stale RUNNING claim older than this may be resumed. */
  staleRunningMs: positiveIntEnv("DIGEST_STALE_RUNNING_MS", 10 * 60_000),

  /** Master switch — production default OFF. */
  emailEnabled: boolEnv("DIGEST_EMAIL_ENABLED", false),
  smtpHost: optionalEnv("SMTP_HOST") ?? "smtp.gmail.com",
  smtpPort: positiveIntEnv("SMTP_PORT", 587),
  smtpUser: optionalEnv("SMTP_USER"),
  smtpPass: optionalEnv("SMTP_PASS"),
  smtpFrom: optionalEnv("SMTP_FROM") ?? DEFAULT_SMTP_FROM,
  /** Comma-separated emails; empty = all users when enabled. */
  emailAllowlist: parseAllowlist(optionalEnv("DIGEST_EMAIL_ALLOWLIST")),
  /** Dev/test only — force every send to this inbox. Never set in prod. */
  emailRedirectTo: optionalEnv("DIGEST_EMAIL_REDIRECT_TO"),
} as const;
