import { AuditAction } from "@unified/types";
import { auditLog } from "../lib/audit-log.js";
import { prisma } from "../lib/prisma.js";
import {
  assertFactsWithinAllowlist,
  collectDigestFacts,
} from "./collect-facts.js";
import { inAppDispatcher } from "./dispatch.js";
import { digestEnv } from "./env.js";
import { isDigestEmailConfigured } from "./email.js";
import { summarizeDigest, summarizeDigestEmail } from "./summarize.js";
import { isDigestEmpty } from "./types.js";

export type DigestRunStats = {
  skipped?: boolean;
  processedUserCount: number;
  notifiedUserCount: number;
  skippedEmpty: number;
  alreadyExists: number;
  errors: number;
  emailed: number;
  emailSkipped: number;
  emailErrors: number;
};

function emptyStats(partial?: Partial<DigestRunStats>): DigestRunStats {
  return {
    processedUserCount: 0,
    notifiedUserCount: 0,
    skippedEmpty: 0,
    alreadyExists: 0,
    errors: 0,
    emailed: 0,
    emailSkipped: 0,
    emailErrors: 0,
    ...partial,
  };
}

function truncateToUtcIntervalBucket(d: Date, intervalHours: number): Date {
  const hours = Math.max(1, intervalHours);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const day = d.getUTCDate();
  const h = d.getUTCHours();
  const bucketHour = Math.floor(h / hours) * hours;
  return new Date(Date.UTC(y, m, day, bucketHour, 0, 0, 0));
}

export function computeScheduledFor(now: Date = new Date()): Date {
  return truncateToUtcIntervalBucket(now, digestEnv.intervalHours);
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
    return emptyStats({ skipped: true });
  }

  const now = input?.now ?? new Date();
  const scheduledFor = input?.scheduledFor ?? computeScheduledFor(now);
  const claimed = await claimOrResumeRun(scheduledFor);
  if (!claimed) {
    return emptyStats({ skipped: true });
  }

  const stats = emptyStats();

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

        const inAppSummary = await summarizeDigest(facts);
        const result = await inAppDispatcher.deliverInApp({
          userId,
          digestRunId: claimed.runId,
          title: inAppSummary.title,
          body: inAppSummary.body,
          facts,
        });

        if (result === "created") {
          stats.notifiedUserCount += 1;
        } else {
          stats.alreadyExists += 1;
        }

        // Soft-fail: email errors never fail the digest run.
        try {
          const emailSummary = isDigestEmailConfigured()
            ? await summarizeDigestEmail(facts)
            : inAppSummary;
          const emailResult = await inAppDispatcher.deliverEmail({
            userId,
            digestRunId: claimed.runId,
            title: emailSummary.title,
            body: emailSummary.body,
          });
          if (emailResult === "created") {
            stats.emailed += 1;
          } else if (emailResult === "error") {
            stats.emailErrors += 1;
          } else {
            // skipped | exists
            stats.emailSkipped += 1;
          }
        } catch {
          stats.emailErrors += 1;
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
          emailed: stats.emailed,
          emailSkipped: stats.emailSkipped,
          emailErrors: stats.emailErrors,
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
          emailed: stats.emailed,
          emailSkipped: stats.emailSkipped,
          emailErrors: stats.emailErrors,
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
