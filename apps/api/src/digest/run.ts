import { AuditAction } from "@unified/types";
import { auditLog } from "../lib/audit-log.js";
import { prisma } from "../lib/prisma.js";
import {
  assertFactsWithinAllowlist,
  collectDigestFacts,
} from "./collect-facts.js";
import { inAppDispatcher } from "./dispatch.js";
import { digestEnv } from "./env.js";
import { summarizeDigest } from "./summarize.js";
import { isDigestEmpty } from "./types.js";

export type DigestRunStats = {
  skipped?: boolean;
  processedUserCount: number;
  notifiedUserCount: number;
  skippedEmpty: number;
  alreadyExists: number;
  errors: number;
};

function truncateToUtcDayBucket(d: Date): Date {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 6, 0, 0, 0),
  );
}

export function computeScheduledFor(now: Date = new Date()): Date {
  return truncateToUtcDayBucket(now);
}

async function claimOrResumeRun(scheduledFor: Date): Promise<{
  runId: string;
  resume: boolean;
} | null> {
  try {
    const created = await prisma.digestRun.create({
      data: {
        scheduledFor,
        status: "RUNNING",
      },
    });
    return { runId: created.id, resume: false };
  } catch (err) {
    if (
      !(
        err &&
        typeof err === "object" &&
        "code" in err &&
        (err as { code: string }).code === "P2002"
      )
    ) {
      throw err;
    }
  }

  const existing = await prisma.digestRun.findUnique({
    where: { scheduledFor },
  });
  if (!existing) {
    return null;
  }

  if (existing.status === "SUCCEEDED" || existing.status === "SKIPPED") {
    return null;
  }

  if (existing.status === "RUNNING") {
    const age = Date.now() - existing.startedAt.getTime();
    if (age < digestEnv.staleRunningMs) {
      return null; // peer worker
    }
  }

  // FAILED or stale RUNNING → resume
  await prisma.digestRun.update({
    where: { id: existing.id },
    data: {
      status: "RUNNING",
      errorMessage: null,
      startedAt: new Date(),
      finishedAt: null,
    },
  });
  return { runId: existing.id, resume: true };
}

export async function runDigestJob(input?: {
  scheduledFor?: Date;
  now?: Date;
}): Promise<DigestRunStats> {
  if (!digestEnv.enabled) {
    return {
      skipped: true,
      processedUserCount: 0,
      notifiedUserCount: 0,
      skippedEmpty: 0,
      alreadyExists: 0,
      errors: 0,
    };
  }

  const now = input?.now ?? new Date();
  const scheduledFor = input?.scheduledFor ?? computeScheduledFor(now);
  const claimed = await claimOrResumeRun(scheduledFor);
  if (!claimed) {
    return {
      skipped: true,
      processedUserCount: 0,
      notifiedUserCount: 0,
      skippedEmpty: 0,
      alreadyExists: 0,
      errors: 0,
    };
  }

  const stats: DigestRunStats = {
    processedUserCount: 0,
    notifiedUserCount: 0,
    skippedEmpty: 0,
    alreadyExists: 0,
    errors: 0,
  };

  try {
    const memberships = await prisma.orgMembership.findMany({
      where: { acceptedAt: { not: null } },
      select: { userId: true },
      distinct: ["userId"],
      take: digestEnv.maxUsersPerRun,
    });

    const thresholds = {
      staleDays: digestEnv.ticketStaleDays,
      idleDays: digestEnv.prIdleDays,
    };

    for (const { userId } of memberships) {
      stats.processedUserCount += 1;
      try {
        const facts = await collectDigestFacts(userId, now, thresholds);
        assertFactsWithinAllowlist(facts);

        if (isDigestEmpty(facts)) {
          stats.skippedEmpty += 1;
          continue;
        }

        const summary = await summarizeDigest(facts);
        const result = await inAppDispatcher.deliverInApp({
          userId,
          digestRunId: claimed.runId,
          title: summary.title,
          body: summary.body,
          facts,
        });

        if (result === "created") {
          stats.notifiedUserCount += 1;
        } else {
          stats.alreadyExists += 1;
        }
      } catch {
        stats.errors += 1;
      }
    }

    await prisma.digestRun.update({
      where: { id: claimed.runId },
      data: {
        status: "SUCCEEDED",
        finishedAt: new Date(),
        processedUserCount: stats.processedUserCount,
        notifiedUserCount: stats.notifiedUserCount,
        stats: {
          skippedEmpty: stats.skippedEmpty,
          alreadyExists: stats.alreadyExists,
          errors: stats.errors,
        },
      },
    });

    await auditLog.record({
      orgId: null,
      userId: null,
      action: AuditAction.DIGEST_RUN_COMPLETED,
      entityType: "DigestRun",
      entityId: claimed.runId,
      metadata: {
        scheduledFor: scheduledFor.toISOString(),
        ...stats,
      },
    });

    return stats;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.digestRun.update({
      where: { id: claimed.runId },
      data: {
        status: "FAILED",
        finishedAt: new Date(),
        errorMessage: message.slice(0, 500),
        processedUserCount: stats.processedUserCount,
        notifiedUserCount: stats.notifiedUserCount,
        stats: {
          skippedEmpty: stats.skippedEmpty,
          alreadyExists: stats.alreadyExists,
          errors: stats.errors,
        },
      },
    });

    await auditLog.record({
      orgId: null,
      userId: null,
      action: AuditAction.DIGEST_RUN_FAILED,
      entityType: "DigestRun",
      entityId: claimed.runId,
      metadata: {
        scheduledFor: scheduledFor.toISOString(),
        error: message.slice(0, 200),
        ...stats,
      },
    });

    throw err;
  }
}
