import { OrgRole, PR_MUTATOR_ROLES } from "@unified/types";
import { prisma } from "../lib/prisma.js";
import {
  listInboundSharedPrIds,
  listInboundSharedTicketIds,
} from "../lib/resource-access.js";
import {
  emptyDigestFacts,
  type DigestFactItem,
  type DigestFacts,
  type DigestThresholds,
} from "./types.js";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function idleDays(updatedAt: Date, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - updatedAt.getTime()) / MS_PER_DAY));
}

function isStale(updatedAt: Date, now: Date, staleDays: number): boolean {
  return updatedAt.getTime() <= now.getTime() - staleDays * MS_PER_DAY;
}

/**
 * Collect personalized digest facts for a user across all accepted memberships
 * and inbound shares. Isolation mirrors resource-access helpers — do not reimplement.
 */
export async function collectDigestFacts(
  userId: string,
  now: Date = new Date(),
  thresholds: DigestThresholds = { staleDays: 3, idleDays: 3 },
): Promise<DigestFacts> {
  const memberships = await prisma.orgMembership.findMany({
    where: { userId, acceptedAt: { not: null } },
    include: { org: { select: { id: true, name: true } } },
  });

  if (memberships.length === 0) {
    return emptyDigestFacts(userId);
  }

  const allowedOrgIds = new Set<string>();
  const itemsByKey = new Map<string, DigestFactItem>();
  let assignedTicketCount = 0;
  let staleAssignedTicketCount = 0;
  let waitingPrCount = 0;
  let oldestWaitingPrIdleDays: number | null = null;
  let sharedTicketCount = 0;
  let sharedPrCount = 0;

  for (const m of memberships) {
    const orgId = m.orgId;
    const orgName = m.org.name;
    allowedOrgIds.add(orgId);

    // Member lane — tickets: assignee only (guests included)
    const assignedTickets = await prisma.ticket.findMany({
      where: {
        orgId,
        assigneeId: userId,
        status: { in: ["OPEN", "IN_PROGRESS"] },
      },
      select: {
        id: true,
        title: true,
        orgId: true,
        updatedAt: true,
      },
    });

    for (const t of assignedTickets) {
      assignedTicketCount += 1;
      const stale = isStale(t.updatedAt, now, thresholds.staleDays);
      if (stale) {
        staleAssignedTicketCount += 1;
      }
      const key = `ticket:${t.id}`;
      if (!itemsByKey.has(key)) {
        itemsByKey.set(key, {
          kind: "ticket",
          id: t.id,
          title: t.title,
          orgId: t.orgId,
          orgName,
          signal: stale ? "stale_assigned" : "assigned",
        });
      }
    }

    // Member lane — PRs: ORG_ADMIN | REVIEWER only, pending my review
    if ((PR_MUTATOR_ROLES as readonly string[]).includes(m.role)) {
      const waitingPrs = await prisma.pullRequest.findMany({
        where: {
          orgId,
          status: "IN_REVIEW",
          reviewers: { some: { userId } },
        },
        select: {
          id: true,
          title: true,
          orgId: true,
          updatedAt: true,
        },
      });

      for (const p of waitingPrs) {
        waitingPrCount += 1;
        const days = idleDays(p.updatedAt, now);
        if (
          oldestWaitingPrIdleDays === null ||
          days > oldestWaitingPrIdleDays
        ) {
          oldestWaitingPrIdleDays = days;
        }
        const key = `pr:${p.id}`;
        if (!itemsByKey.has(key)) {
          itemsByKey.set(key, {
            kind: "pull_request",
            id: p.id,
            title: p.title,
            orgId: p.orgId,
            orgName,
            signal: "waiting_review",
          });
        }
      }
    }

    // Guests have no share union in product ticket lists when CROSS_ORG_GUEST —
    // but inbound shares to a guest are still valid if they have an accepted membership
    // as grantee. Plan: share lane for every accepted membership via listInboundShared*.
    // Frank (guest) typically has no shares; Eve (agent) does.
    // Do NOT skip share lane for guests — product share path allows any live member.
    if (m.role === OrgRole.CROSS_ORG_GUEST) {
      // Guests: still allow share lane (explicit grants). No member PR lane (already skipped).
    }

    const sharedTicketIds = await listInboundSharedTicketIds(userId, orgId);
    if (sharedTicketIds.length > 0) {
      const rows = await prisma.ticket.findMany({
        where: { id: { in: sharedTicketIds } },
        select: {
          id: true,
          title: true,
          orgId: true,
          org: { select: { name: true } },
        },
      });
      for (const t of rows) {
        allowedOrgIds.add(t.orgId);
        const key = `ticket:${t.id}`;
        if (!itemsByKey.has(key)) {
          sharedTicketCount += 1;
          itemsByKey.set(key, {
            kind: "ticket",
            id: t.id,
            title: t.title,
            orgId: t.orgId,
            orgName: t.org.name,
            signal: "shared",
          });
        }
      }
    }

    const sharedPrIds = await listInboundSharedPrIds(userId, orgId);
    if (sharedPrIds.length > 0) {
      const rows = await prisma.pullRequest.findMany({
        where: { id: { in: sharedPrIds } },
        select: {
          id: true,
          title: true,
          orgId: true,
          org: { select: { name: true } },
        },
      });
      for (const p of rows) {
        allowedOrgIds.add(p.orgId);
        const key = `pr:${p.id}`;
        // Prefer waiting_review over shared if already present (dedupe)
        if (!itemsByKey.has(key)) {
          sharedPrCount += 1;
          itemsByKey.set(key, {
            kind: "pull_request",
            id: p.id,
            title: p.title,
            orgId: p.orgId,
            orgName: p.org.name,
            signal: "shared",
          });
        }
      }
    }
  }

  return {
    userId,
    collectedAt: now.toISOString(),
    allowedOrgIds: [...allowedOrgIds],
    assignedTicketCount,
    staleAssignedTicketCount,
    waitingPrCount,
    oldestWaitingPrIdleDays,
    sharedTicketCount,
    sharedPrCount,
    items: [...itemsByKey.values()],
  };
}

/** Defense in depth — every fact orgId must be in the allowlist. */
export function assertFactsWithinAllowlist(facts: DigestFacts): void {
  const allowed = new Set(facts.allowedOrgIds);
  for (const item of facts.items) {
    if (!allowed.has(item.orgId)) {
      throw new Error(
        `Digest fact orgId ${item.orgId} not in allowlist for user ${facts.userId}`,
      );
    }
  }
}
