import "../lib/load-env.js";
import { computeScheduledFor, runDigestJob } from "../digest/run.js";
import { digestEnv } from "../digest/env.js";

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

  const stats = await runDigestJob({ scheduledFor });
  console.log(JSON.stringify({ msg: "digest_job_done", ...stats }));
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
