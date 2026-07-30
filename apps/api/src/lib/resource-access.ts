import type { Ticket } from "@prisma/client";
import type { Prisma } from "@prisma/client";
import {
  OrgRole,
  type ResourceAccess,
  type SharedFromOrgSummary,
} from "@unified/types";
import { prisma } from "./prisma.js";

export class ResourceAccessError extends Error {
  readonly statusCode = 404;

  constructor(message = "Not found") {
    super(message);
    this.name = "ResourceAccessError";
  }
}

export type TicketAccessResult = {
  ticket: Ticket;
  access: ResourceAccess;
  shareId?: string;
  sharedFromOrg?: SharedFromOrgSummary;
};

export type PrWithRelations = Prisma.PullRequestGetPayload<{
  include: {
    reviewers: true;
    versions: true;
    reviews: true;
  };
}>;

export type PrAccessResult = {
  pr: PrWithRelations;
  access: ResourceAccess;
  shareId?: string;
  sharedFromOrg?: SharedFromOrgSummary;
};

const PR_INCLUDE = {
  reviewers: true,
  versions: { orderBy: { versionNumber: "asc" as const } },
  reviews: { orderBy: { createdAt: "desc" as const } },
} satisfies Prisma.PullRequestInclude;

async function loadSharedFromOrg(
  orgId: string,
): Promise<SharedFromOrgSummary | undefined> {
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { id: true, name: true, slug: true },
  });
  if (!org) {
    return undefined;
  }
  return { orgId: org.id, orgName: org.name, orgSlug: org.slug };
}

/**
 * Live accepted membership on session org — required for both member and
 * share paths. Missing/pending → 404 (not 403).
 */
async function requireLiveMembership(userId: string, sessionOrgId: string) {
  const membership = await prisma.orgMembership.findUnique({
    where: {
      userId_orgId: {
        userId,
        orgId: sessionOrgId,
      },
    },
  });

  if (!membership?.acceptedAt) {
    throw new ResourceAccessError("Not found");
  }

  return membership;
}

/**
 * Live re-check: ACTIVE grant for this user+session grantee org, matching
 * resource, with ACCEPTED connection. Caller must already have verified
 * live membership on sessionOrgId. No cross-request cache.
 */
async function findValidShareGrant(input: {
  userId: string;
  sessionOrgId: string;
  resourceType: "TICKET" | "PULL_REQUEST";
  resourceId: string;
  ownerOrgId: string;
}) {
  const grant = await prisma.shareGrant.findFirst({
    where: {
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      grantedToUserId: input.userId,
      granteeOrgId: input.sessionOrgId,
      ownerOrgId: input.ownerOrgId,
      status: "ACTIVE",
    },
    include: {
      orgConnection: { select: { id: true, status: true } },
    },
  });

  if (!grant || grant.orgConnection.status !== "ACCEPTED") {
    return null;
  }

  return grant;
}

/**
 * Two-lane access for ticket reads / comments / attachment downloads.
 * Mutations must keep using getOrgTicketOrThrow (session-org strict).
 */
export async function resolveTicketAccess(input: {
  userId: string;
  role: string | null;
  sessionOrgId: string;
  ticketId: string;
}): Promise<TicketAccessResult> {
  // Live membership on session org first (hostile #4 / membership drop → 404).
  const membership = await requireLiveMembership(
    input.userId,
    input.sessionOrgId,
  );
  const role = membership.role;

  const ticket = await prisma.ticket.findFirst({
    where: { id: input.ticketId },
  });

  if (!ticket) {
    throw new ResourceAccessError("Ticket not found");
  }

  // Member path
  if (ticket.orgId === input.sessionOrgId) {
    if (role === OrgRole.CROSS_ORG_GUEST) {
      if (ticket.assigneeId !== input.userId) {
        throw new ResourceAccessError("Ticket not found");
      }
    }
    return { ticket, access: "member" };
  }

  // Share path — session must be grantee org
  const grant = await findValidShareGrant({
    userId: input.userId,
    sessionOrgId: input.sessionOrgId,
    resourceType: "TICKET",
    resourceId: ticket.id,
    ownerOrgId: ticket.orgId,
  });

  if (!grant) {
    throw new ResourceAccessError("Ticket not found");
  }

  const sharedFromOrg = await loadSharedFromOrg(ticket.orgId);

  return {
    ticket,
    access: "shared",
    shareId: grant.id,
    sharedFromOrg,
  };
}

/**
 * Two-lane access for PR reads / comments.
 * Mutations must keep using getOrgPrOrThrow (session-org strict).
 * Guests have no in-org PR member access (no assignee concept).
 */
export async function resolvePrAccess(input: {
  userId: string;
  role: string | null;
  sessionOrgId: string;
  prId: string;
}): Promise<PrAccessResult> {
  const membership = await requireLiveMembership(
    input.userId,
    input.sessionOrgId,
  );
  const role = membership.role;

  const pr = await prisma.pullRequest.findFirst({
    where: { id: input.prId },
    include: PR_INCLUDE,
  });

  if (!pr) {
    throw new ResourceAccessError("Pull request not found");
  }

  if (pr.orgId === input.sessionOrgId) {
    if (role === OrgRole.CROSS_ORG_GUEST) {
      throw new ResourceAccessError("Pull request not found");
    }
    return { pr, access: "member" };
  }

  const grant = await findValidShareGrant({
    userId: input.userId,
    sessionOrgId: input.sessionOrgId,
    resourceType: "PULL_REQUEST",
    resourceId: pr.id,
    ownerOrgId: pr.orgId,
  });

  if (!grant) {
    throw new ResourceAccessError("Pull request not found");
  }

  const sharedFromOrg = await loadSharedFromOrg(pr.orgId);

  return {
    pr,
    access: "shared",
    shareId: grant.id,
    sharedFromOrg,
  };
}

/** ACTIVE inbound ticket IDs for (user, session as grantee org), connection still ACCEPTED. */
export async function listInboundSharedTicketIds(
  userId: string,
  sessionOrgId: string,
): Promise<string[]> {
  const grants = await prisma.shareGrant.findMany({
    where: {
      resourceType: "TICKET",
      grantedToUserId: userId,
      granteeOrgId: sessionOrgId,
      status: "ACTIVE",
      orgConnection: { status: "ACCEPTED" },
    },
    select: { resourceId: true, ownerOrgId: true },
  });

  if (grants.length === 0) {
    return [];
  }

  const membership = await prisma.orgMembership.findUnique({
    where: { userId_orgId: { userId, orgId: sessionOrgId } },
  });
  if (!membership?.acceptedAt) {
    return [];
  }

  return grants.map((g) => g.resourceId);
}

/** ACTIVE inbound PR IDs for (user, session as grantee org). */
export async function listInboundSharedPrIds(
  userId: string,
  sessionOrgId: string,
): Promise<string[]> {
  const grants = await prisma.shareGrant.findMany({
    where: {
      resourceType: "PULL_REQUEST",
      grantedToUserId: userId,
      granteeOrgId: sessionOrgId,
      status: "ACTIVE",
      orgConnection: { status: "ACCEPTED" },
    },
    select: { resourceId: true },
  });

  if (grants.length === 0) {
    return [];
  }

  const membership = await prisma.orgMembership.findUnique({
    where: { userId_orgId: { userId, orgId: sessionOrgId } },
  });
  if (!membership?.acceptedAt) {
    return [];
  }

  return grants.map((g) => g.resourceId);
}
