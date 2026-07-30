import type { OrgConnection, Organization } from "@prisma/client";
import type { ConnectionDto, ConnectionRecipientDto } from "@unified/types";
import { prisma } from "../../lib/prisma.js";

export class ConnectionError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "ConnectionError";
  }
}

/** Canonical pair ordering — orgAId < orgBId (lexicographic). */
export function canonicalOrgPair(
  a: string,
  b: string,
): [orgAId: string, orgBId: string] {
  return a < b ? [a, b] : [b, a];
}

/** First letters of up to 2 words, uppercase. */
export function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");
}

type OrgSummary = Pick<Organization, "id" | "name" | "slug">;

type ConnectionWithOrgs = OrgConnection & {
  orgA: OrgSummary;
  orgB: OrgSummary;
};

const CONNECTION_INCLUDE = {
  orgA: { select: { id: true, name: true, slug: true } },
  orgB: { select: { id: true, name: true, slug: true } },
} as const;

function orgSummaryToDto(org: OrgSummary): {
  orgId: string;
  orgName: string;
  orgSlug: string;
} {
  return { orgId: org.id, orgName: org.name, orgSlug: org.slug };
}

function partnerOrgFor(
  conn: ConnectionWithOrgs,
  sessionOrgId: string,
): { orgId: string; orgName: string; orgSlug: string } {
  return orgSummaryToDto(conn.orgAId === sessionOrgId ? conn.orgB : conn.orgA);
}

/** Live re-check: is this user an accepted member of this org right now? */
async function isAcceptedMember(
  userId: string,
  orgId: string,
): Promise<boolean> {
  const membership = await prisma.orgMembership.findUnique({
    where: { userId_orgId: { userId, orgId } },
  });
  return !!membership?.acceptedAt;
}

/**
 * Direction is relative to the viewing session org: requester side is
 * whichever of orgA/orgB the requestedBy user is an accepted member of,
 * preferring the session org itself when the requester belongs to both.
 */
async function resolveDirection(
  requestedById: string,
  sessionOrgId: string,
): Promise<"incoming" | "outgoing"> {
  const requesterIsSessionOrg = await isAcceptedMember(
    requestedById,
    sessionOrgId,
  );
  return requesterIsSessionOrg ? "outgoing" : "incoming";
}

function toConnectionDto(
  conn: ConnectionWithOrgs,
  sessionOrgId: string,
  direction: "incoming" | "outgoing",
): ConnectionDto {
  return {
    id: conn.id,
    status: conn.status,
    partnerOrg: partnerOrgFor(conn, sessionOrgId),
    direction,
    requestedById: conn.requestedById,
    respondedById: conn.respondedById,
    createdAt: conn.createdAt.toISOString(),
  };
}

function assertSessionOnConnection(
  conn: Pick<OrgConnection, "orgAId" | "orgBId">,
  sessionOrgId: string,
): void {
  if (conn.orgAId !== sessionOrgId && conn.orgBId !== sessionOrgId) {
    throw new ConnectionError("Connection not found", 404);
  }
}

export async function listConnections(
  sessionOrgId: string,
): Promise<ConnectionDto[]> {
  const rows = await prisma.orgConnection.findMany({
    where: {
      OR: [{ orgAId: sessionOrgId }, { orgBId: sessionOrgId }],
    },
    include: CONNECTION_INCLUDE,
    orderBy: { createdAt: "desc" },
  });

  if (rows.length === 0) {
    return [];
  }

  const requesterIds = [...new Set(rows.map((row) => row.requestedById))];
  const memberships = await prisma.orgMembership.findMany({
    where: {
      userId: { in: requesterIds },
      orgId: sessionOrgId,
      acceptedAt: { not: null },
    },
    select: { userId: true },
  });
  const sessionRequesterIds = new Set(memberships.map((m) => m.userId));

  return rows.map((row) =>
    toConnectionDto(
      row,
      sessionOrgId,
      sessionRequesterIds.has(row.requestedById) ? "outgoing" : "incoming",
    ),
  );
}

export interface PlatformConnectionSummary {
  id: string;
  status: OrgConnection["status"];
  orgA: { orgId: string; orgName: string; orgSlug: string };
  orgB: { orgId: string; orgName: string; orgSlug: string };
  requestedById: string;
  respondedById: string | null;
  createdAt: string;
}

export async function listAllConnections(): Promise<
  PlatformConnectionSummary[]
> {
  const rows = await prisma.orgConnection.findMany({
    include: CONNECTION_INCLUDE,
    orderBy: { createdAt: "desc" },
  });

  return rows.map((row) => ({
    id: row.id,
    status: row.status,
    orgA: orgSummaryToDto(row.orgA),
    orgB: orgSummaryToDto(row.orgB),
    requestedById: row.requestedById,
    respondedById: row.respondedById,
    createdAt: row.createdAt.toISOString(),
  }));
}

export async function requestConnection(input: {
  sessionOrgId: string;
  userId: string;
  partnerOrgSlug: string;
}): Promise<{ connection: ConnectionDto; created: boolean }> {
  const partner = await prisma.organization.findUnique({
    where: { slug: input.partnerOrgSlug },
  });

  if (!partner) {
    throw new ConnectionError("Partner organization not found", 404);
  }

  if (partner.id === input.sessionOrgId) {
    throw new ConnectionError(
      "Cannot connect an organization to itself",
      400,
      "same_org_connection",
    );
  }

  const [orgAId, orgBId] = canonicalOrgPair(input.sessionOrgId, partner.id);

  const existing = await prisma.orgConnection.findUnique({
    where: { orgAId_orgBId: { orgAId, orgBId } },
    include: CONNECTION_INCLUDE,
  });

  if (existing) {
    if (existing.status === "PENDING" || existing.status === "ACCEPTED") {
      throw new ConnectionError(
        `Connection already ${existing.status.toLowerCase()}`,
        409,
        "connection_exists",
      );
    }

    // REJECTED / REVOKED → reset in place to PENDING
    const updated = await prisma.orgConnection.update({
      where: { id: existing.id },
      data: {
        status: "PENDING",
        requestedById: input.userId,
        respondedById: null,
      },
      include: CONNECTION_INCLUDE,
    });

    return {
      connection: toConnectionDto(updated, input.sessionOrgId, "outgoing"),
      created: false,
    };
  }

  const created = await prisma.orgConnection.create({
    data: {
      orgAId,
      orgBId,
      status: "PENDING",
      requestedById: input.userId,
    },
    include: CONNECTION_INCLUDE,
  });

  return {
    connection: toConnectionDto(created, input.sessionOrgId, "outgoing"),
    created: true,
  };
}

export async function acceptConnection(input: {
  connectionId: string;
  sessionOrgId: string;
  userId: string;
}): Promise<ConnectionDto> {
  const conn = await prisma.orgConnection.findUnique({
    where: { id: input.connectionId },
    include: CONNECTION_INCLUDE,
  });

  if (!conn) {
    throw new ConnectionError("Connection not found", 404);
  }

  assertSessionOnConnection(conn, input.sessionOrgId);

  if (conn.status !== "PENDING") {
    throw new ConnectionError(
      "Only pending connections can be accepted",
      400,
      "invalid_connection_status",
    );
  }

  const direction = await resolveDirection(
    conn.requestedById,
    input.sessionOrgId,
  );
  if (direction === "outgoing") {
    throw new ConnectionError(
      "Requesting organization cannot accept its own connection request",
      403,
      "cannot_accept_own_request",
    );
  }

  const updated = await prisma.orgConnection.update({
    where: { id: conn.id },
    data: {
      status: "ACCEPTED",
      respondedById: input.userId,
    },
    include: CONNECTION_INCLUDE,
  });

  return toConnectionDto(updated, input.sessionOrgId, "incoming");
}

export async function rejectConnection(input: {
  connectionId: string;
  sessionOrgId: string;
  userId: string;
}): Promise<ConnectionDto> {
  const conn = await prisma.orgConnection.findUnique({
    where: { id: input.connectionId },
    include: CONNECTION_INCLUDE,
  });

  if (!conn) {
    throw new ConnectionError("Connection not found", 404);
  }

  assertSessionOnConnection(conn, input.sessionOrgId);

  if (conn.status !== "PENDING") {
    throw new ConnectionError(
      "Only pending connections can be rejected",
      400,
      "invalid_connection_status",
    );
  }

  const direction = await resolveDirection(
    conn.requestedById,
    input.sessionOrgId,
  );
  if (direction === "outgoing") {
    throw new ConnectionError(
      "Requesting organization cannot reject its own connection request",
      403,
      "cannot_reject_own_request",
    );
  }

  const updated = await prisma.orgConnection.update({
    where: { id: conn.id },
    data: {
      status: "REJECTED",
      respondedById: input.userId,
    },
    include: CONNECTION_INCLUDE,
  });

  return toConnectionDto(updated, input.sessionOrgId, "incoming");
}

/** Soft-revoke connection and cascade ACTIVE share grants for this pair only. */
export async function revokeConnection(input: {
  connectionId: string;
  sessionOrgId: string | null;
  userId: string;
  /** When true, skip session-org membership check (platform admin). */
  platformOverride?: boolean;
}): Promise<{
  connection: ConnectionWithOrgs;
  revokedGrantCount: number;
}> {
  const conn = await prisma.orgConnection.findUnique({
    where: { id: input.connectionId },
    include: CONNECTION_INCLUDE,
  });

  if (!conn) {
    throw new ConnectionError("Connection not found", 404);
  }

  if (!input.platformOverride) {
    if (!input.sessionOrgId) {
      throw new ConnectionError("Connection not found", 404);
    }
    assertSessionOnConnection(conn, input.sessionOrgId);
  }

  if (conn.status === "REVOKED") {
    throw new ConnectionError(
      "Connection already revoked",
      409,
      "already_revoked",
    );
  }

  const now = new Date();

  const [, grantResult] = await prisma.$transaction([
    prisma.orgConnection.update({
      where: { id: conn.id },
      data: { status: "REVOKED" },
    }),
    prisma.shareGrant.updateMany({
      where: {
        orgConnectionId: conn.id,
        status: "ACTIVE",
      },
      data: {
        status: "REVOKED",
        revokedAt: now,
        revokedById: input.userId,
        revokeReason: "connection_revoked",
      },
    }),
  ]);

  const refreshed = await prisma.orgConnection.findUniqueOrThrow({
    where: { id: conn.id },
    include: CONNECTION_INCLUDE,
  });

  return {
    connection: refreshed,
    revokedGrantCount: grantResult.count,
  };
}

export async function listRecipients(input: {
  connectionId: string;
  sessionOrgId: string;
  query?: string;
  limit: number;
  offset: number;
}): Promise<{ recipients: ConnectionRecipientDto[]; total: number }> {
  const conn = await prisma.orgConnection.findUnique({
    where: { id: input.connectionId },
  });

  if (!conn) {
    throw new ConnectionError("Connection not found", 404);
  }

  assertSessionOnConnection(conn, input.sessionOrgId);

  if (conn.status !== "ACCEPTED") {
    throw new ConnectionError(
      "Recipients are only available for accepted connections",
      400,
      "connection_not_accepted",
    );
  }

  const partnerOrgId =
    conn.orgAId === input.sessionOrgId ? conn.orgBId : conn.orgAId;

  const where = {
    orgId: partnerOrgId,
    acceptedAt: { not: null },
    ...(input.query
      ? {
          user: {
            name: { contains: input.query, mode: "insensitive" as const },
          },
        }
      : {}),
  };

  const [total, memberships] = await Promise.all([
    prisma.orgMembership.count({ where }),
    prisma.orgMembership.findMany({
      where,
      include: {
        user: { select: { id: true, name: true } },
      },
      orderBy: { user: { name: "asc" } },
      skip: input.offset,
      take: input.limit,
    }),
  ]);

  const recipients: ConnectionRecipientDto[] = memberships.map((m) => ({
    userId: m.user.id,
    name: m.user.name,
    initials: initialsFromName(m.user.name),
  }));

  return { recipients, total };
}
