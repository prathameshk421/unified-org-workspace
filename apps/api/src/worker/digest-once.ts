import "../lib/load-env.js";
import { computeScheduledFor, runDigestJob } from "../digest/run.js";
import { digestEnv } from "../digest/env.js";
import { prisma } from "../lib/prisma.js";

const DB_READY_ATTEMPTS = 12;
const DB_READY_DELAY_MS = 5_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Direct VPC egress on Cloud Run Jobs can take a minute+ before private Cloud
 * SQL accepts connections. Fail fast without this and the job never digests.
 */
async function waitForDatabase(): Promise<void> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= DB_READY_ATTEMPTS; attempt += 1) {
    try {
      await prisma.$queryRaw`SELECT 1`;
      console.log(
        JSON.stringify({
          msg: "digest_db_ready",
          attempt,
        }),
      );
      return;
    } catch (err) {
      lastError = err;
      console.log(
        JSON.stringify({
          msg: "digest_db_wait",
          attempt,
          maxAttempts: DB_READY_ATTEMPTS,
          error: err instanceof Error ? err.message : String(err),
        }),
      );
      if (attempt < DB_READY_ATTEMPTS) {
        await sleep(DB_READY_DELAY_MS);
      }
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error(`Database not reachable after ${DB_READY_ATTEMPTS} attempts`);
}

async function main(): Promise<void> {
  const scheduledArg = process.argv.find((a) => a.startsWith("--scheduled-for="));
  const scheduledFor = scheduledArg
    ? new Date(scheduledArg.slice("--scheduled-for=".length))
    : computeScheduledFor();

  if (Number.isNaN(scheduledFor.getTime())) {
    console.error("Invalid --scheduled-for= ISO date");
    process.exit(1);
  }

  console.log(
    JSON.stringify({
      msg: "digest_job_start",
      enabled: digestEnv.enabled,
      llmEnabled: digestEnv.llmEnabled,
      model: digestEnv.groqModel,
      scheduledFor: scheduledFor.toISOString(),
    }),
  );

  await waitForDatabase();

  const stats = await runDigestJob({ scheduledFor });
  console.log(JSON.stringify({ msg: "digest_job_done", ...stats }));
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
