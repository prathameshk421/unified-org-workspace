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

/**
 * Worker-safe env — does not require JWT_SECRET.
 * Import load-env before reading process.env in the worker entrypoint.
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
  /** Stale RUNNING claim older than this may be resumed. */
  staleRunningMs: positiveIntEnv("DIGEST_STALE_RUNNING_MS", 10 * 60_000),
} as const;
