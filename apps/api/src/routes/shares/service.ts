import { Prisma, type ShareGrant } from "@prisma/client";
import {
  OrgRole,
  type OrgRole as OrgRoleType,
  OrgConnectionStatus,
  PR_MUTATOR_ROLES,
  type PullRequestSummary,
  ShareGrantStatus,
  type ShareGrantDto,
  ShareResourceType,
  type ShareResourceType as ShareResourceTypeType,
  TICKET_MUTATOR_ROLES,
  type TicketResponse,
} from "@unified/types";
import {
  listInboundSharedPrIds,
  listInboundSharedTicketIds,
} from "../../lib/resource-access.js";
import { prisma } from "../../lib/prisma.js";
import { canonicalOrgPair } from "../connections/service.js";
import { toPullRequestSummary } from "../prs/mappers.js";
import { getOrgPrOrThrow } from "../prs/service.js";
import { getOrgTicketOrThrow, toTicketResponse } from "../tickets/service.js";

export class ShareError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "ShareError";
  }
}

function toShareGrantDto(grant: ShareGrant): ShareGrantDto {
  return {
    id: grant.id,
    resourceType: grant.resourceType as ShareResourceTypeType,
    resourceId: grant.resourceId,
    ownerOrgId: grant.ownerOrgId,
    granteeOrgId: grant.granteeOrgId,
    grantedToUserId: grant.grantedToUserId,
    grantedByUserId: grant.grantedByUserId,
    orgConnectionId: grant.orgConnectionId,
    status: grant.status as ShareGrantDto["status"],
    revokedAt: grant.revokedAt ? grant.revokedAt.toISOString() : null,
    revokedById: grant.revokedById,
    revokeReason: grant.revokeReason,
    createdAt: grant.createdAt.toISOString(),
    updatedAt: grant.updatedAt.toISOString(),
  };
}

async function createShare(input: {
  resourceType: ShareResourceTypeType;
  resourceId: string;
  ownerOrgId: string;
  actorUserId: string;
  recipientUserId: string;
  partnerOrgSlug: string;
}): Promise<ShareGrantDto> {
  const partner = await prisma.organization.findUnique({
    where: { slug: input.partnerOrgSlug },
  });

  if (!partner) {
    throw new ShareError(
      "Partner organization not found",
      404,
      "partner_org_not_found",
    );
  }

  if (partner.id === input.ownerOrgId) {
    throw new ShareError(
      "Cannot share a resource within the same organization",
      400,
      "same_org_share_not_supported",
    );
  }

  const [orgAId, orgBId] = canonicalOrgPair(input.ownerOrgId, partner.id);
  const connection = await prisma.orgConnection.findUnique({
    where: { orgAId_orgBId: { orgAId, orgBId } },
  });

  if (!connection || connection.status !== OrgConnectionStatus.ACCEPTED) {
    throw new ShareError(
      "No accepted connection with this organization",
      400,
      "connection_not_accepted",
    );
  }

  const recipientMembership = await prisma.orgMembership.findUnique({
    where: {
      userId_orgId: { userId: input.recipientUserId, orgId: partner.id },
    },
  });

  if (!recipientMembership?.acceptedAt) {
    throw new ShareError(
      "Recipient is not an accepted member of the partner organization",
      400,
      "recipient_not_partner_member",
    );
  }

  const ownerMembership = await prisma.orgMembership.findUnique({
    where: {
      userId_orgId: { userId: input.recipientUserId, orgId: input.ownerOrgId },
    },
  });

  if (
    ownerMembership?.acceptedAt &&
    ownerMembership.role !== OrgRole.CROSS_ORG_GUEST
  ) {
    throw new ShareError(
      "Recipient already has access to this organization",
      400,
      "recipient_already_member",
    );
  }

  const existingActive = await prisma.shareGrant.findFirst({
    where: {
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      grantedToUserId: input.recipientUserId,
      status: ShareGrantStatus.ACTIVE,
    },
  });

  if (existingActive) {
    throw new ShareError(
      "An active share already exists for this recipient",
      409,
      "share_already_active",
    );
  }

  try {
    const grant = await prisma.shareGrant.create({
      data: {
        resourceType: input.resourceType,
        resourceId: input.resourceId,
        ownerOrgId: input.ownerOrgId,
        granteeOrgId: partner.id,
        grantedToUserId: input.recipientUserId,
        grantedByUserId: input.actorUserId,
        orgConnectionId: connection.id,
      },
    });

    return toShareGrantDto(grant);
  } catch (error) {
    // Partial unique ACTIVE index race / concurrent create
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new ShareError(
        "An active share already exists for this recipient",
        409,
        "share_already_active",
      );
    }
    throw error;
  }
}

export async function createTicketShare(input: {
  ticketId: string;
  sessionOrgId: string;
  actorUserId: string;
  recipientUserId: string;
  partnerOrgSlug: string;
}): Promise<ShareGrantDto> {
  const ticket = await getOrgTicketOrThrow(input.ticketId, input.sessionOrgId);

  return createShare({
    resourceType: ShareResourceType.TICKET,
    resourceId: ticket.id,
    ownerOrgId: input.sessionOrgId,
    actorUserId: input.actorUserId,
    recipientUserId: input.recipientUserId,
    partnerOrgSlug: input.partnerOrgSlug,
  });
}

export async function createPrShare(input: {
  prId: string;
  sessionOrgId: string;
  actorUserId: string;
  recipientUserId: string;
  partnerOrgSlug: string;
}): Promise<ShareGrantDto> {
  const pr = await getOrgPrOrThrow(input.prId, input.sessionOrgId);

  return createShare({
    resourceType: ShareResourceType.PULL_REQUEST,
    resourceId: pr.id,
    ownerOrgId: input.sessionOrgId,
    actorUserId: input.actorUserId,
    recipientUserId: input.recipientUserId,
    partnerOrgSlug: input.partnerOrgSlug,
  });
}

export async function listTicketShares(
  ticketId: string,
  sessionOrgId: string,
): Promise<ShareGrantDto[]> {
  const ticket = await getOrgTicketOrThrow(ticketId, sessionOrgId);

  const grants = await prisma.shareGrant.findMany({
    where: {
      resourceType: ShareResourceType.TICKET,
      resourceId: ticket.id,
      ownerOrgId: sessionOrgId,
      status: ShareGrantStatus.ACTIVE,
    },
    orderBy: { createdAt: "desc" },
  });

  return grants.map(toShareGrantDto);
}

export async function listPrShares(
  prId: string,
  sessionOrgId: string,
): Promise<ShareGrantDto[]> {
  const pr = await getOrgPrOrThrow(prId, sessionOrgId);

  const grants = await prisma.shareGrant.findMany({
    where: {
      resourceType: ShareResourceType.PULL_REQUEST,
      resourceId: pr.id,
      ownerOrgId: sessionOrgId,
      status: ShareGrantStatus.ACTIVE,
    },
    orderBy: { createdAt: "desc" },
  });

  return grants.map(toShareGrantDto);
}

export async function listOutboundShares(
  sessionOrgId: string,
): Promise<ShareGrantDto[]> {
  const grants = await prisma.shareGrant.findMany({
    where: { ownerOrgId: sessionOrgId },
    orderBy: { createdAt: "desc" },
  });

  return grants.map(toShareGrantDto);
}

export async function listInboundShares(input: {
  sessionOrgId: string;
  userId: string;
  isAdmin: boolean;
}): Promise<ShareGrantDto[]> {
  const where = input.isAdmin
    ? { granteeOrgId: input.sessionOrgId, status: ShareGrantStatus.ACTIVE }
    : {
        granteeOrgId: input.sessionOrgId,
        grantedToUserId: input.userId,
        status: ShareGrantStatus.ACTIVE,
      };

  const grants = await prisma.shareGrant.findMany({
    where,
    orderBy: { createdAt: "desc" },
  });

  return grants.map(toShareGrantDto);
}

export async function revokeShare(input: {
  shareId: string;
  userId: string;
  role: OrgRoleType | null;
  sessionOrgId: string;
}): Promise<{ grant: ShareGrantDto; revokedBy: "owner" | "grantee" }> {
  const grant = await prisma.shareGrant.findUnique({
    where: { id: input.shareId },
  });

  if (!grant) {
    throw new ShareError("Share not found", 404);
  }

  const isOwnerSide =
    input.sessionOrgId === grant.ownerOrgId &&
    input.role != null &&
    ((grant.resourceType === "TICKET" &&
      (TICKET_MUTATOR_ROLES as readonly string[]).includes(input.role)) ||
      (grant.resourceType === "PULL_REQUEST" &&
        (PR_MUTATOR_ROLES as readonly string[]).includes(input.role)) ||
      input.role === OrgRole.ORG_ADMIN);
  const isGranteeAdmin =
    input.sessionOrgId === grant.granteeOrgId &&
    input.role === OrgRole.ORG_ADMIN;
  const isSelf =
    grant.grantedToUserId === input.userId &&
    grant.granteeOrgId === input.sessionOrgId;

  if (!isOwnerSide && !isGranteeAdmin && !isSelf) {
    throw new ShareError("Share not found", 404);
  }

  if (grant.status !== ShareGrantStatus.ACTIVE) {
    throw new ShareError("Share already revoked", 409, "already_revoked");
  }

  const revokedBy: "owner" | "grantee" = isOwnerSide ? "owner" : "grantee";

  const updated = await prisma.shareGrant.update({
    where: { id: grant.id },
    data: {
      status: ShareGrantStatus.REVOKED,
      revokedAt: new Date(),
      revokedById: input.userId,
      revokeReason: "manual",
    },
  });

  const { redactNotificationsForResource } = await import(
    "../../digest/redact.js"
  );
  await redactNotificationsForResource({
    userId: grant.grantedToUserId,
    resourceType: grant.resourceType,
    resourceId: grant.resourceId,
  });

  return { grant: toShareGrantDto(updated), revokedBy };
}

export async function listSharedTickets(
  userId: string,
  sessionOrgId: string,
): Promise<TicketResponse[]> {
  const ids = await listInboundSharedTicketIds(userId, sessionOrgId);
  if (ids.length === 0) {
    return [];
  }

  const tickets = await prisma.ticket.findMany({
    where: { id: { in: ids } },
    orderBy: { updatedAt: "desc" },
  });

  const orgIds = [...new Set(tickets.map((t) => t.orgId))];
  const orgs =
    orgIds.length > 0
      ? await prisma.organization.findMany({
          where: { id: { in: orgIds } },
          select: { id: true, name: true, slug: true },
        })
      : [];
  const orgById = new Map(orgs.map((o) => [o.id, o]));

  return tickets.map((t) => {
    const org = orgById.get(t.orgId);
    return {
      ...toTicketResponse(t),
      access: "shared" as const,
      sharedFromOrg: org
        ? { orgId: org.id, orgName: org.name, orgSlug: org.slug }
        : undefined,
    };
  });
}

export async function listSharedPrs(
  userId: string,
  sessionOrgId: string,
): Promise<PullRequestSummary[]> {
  const ids = await listInboundSharedPrIds(userId, sessionOrgId);
  if (ids.length === 0) {
    return [];
  }

  const prs = await prisma.pullRequest.findMany({
    where: { id: { in: ids } },
    orderBy: { updatedAt: "desc" },
  });

  const orgIds = [...new Set(prs.map((p) => p.orgId))];
  const orgs =
    orgIds.length > 0
      ? await prisma.organization.findMany({
          where: { id: { in: orgIds } },
          select: { id: true, name: true, slug: true },
        })
      : [];
  const orgById = new Map(orgs.map((o) => [o.id, o]));

  return prs.map((p) => {
    const org = orgById.get(p.orgId);
    return {
      ...toPullRequestSummary(p),
      access: "shared" as const,
      sharedFromOrg: org
        ? { orgId: org.id, orgName: org.name, orgSlug: org.slug }
        : undefined,
    };
  });
}
