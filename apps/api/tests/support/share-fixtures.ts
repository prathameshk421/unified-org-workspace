import type { OrgRole } from "@unified/types";
import { ownerDb } from "./db.js";
import {
  createOrg,
  createPullRequest,
  createTicket,
  createUser,
  type FixtureOrg,
  type FixtureUser,
} from "./fixtures.js";

export interface AcceptedConnection {
  id: string;
  orgAId: string;
  orgBId: string;
}

/** Canonical pair ordering — orgAId < orgBId (lexicographic). */
export function canonicalOrgPair(
  a: string,
  b: string,
): [orgAId: string, orgBId: string] {
  return a < b ? [a, b] : [b, a];
}

export async function createAcceptedConnection(input: {
  orgA: FixtureOrg;
  orgB: FixtureOrg;
  requestedById: string;
  respondedById?: string;
}): Promise<AcceptedConnection> {
  const [orgAId, orgBId] = canonicalOrgPair(input.orgA.id, input.orgB.id);
  const row = await ownerDb.orgConnection.create({
    data: {
      orgAId,
      orgBId,
      status: "ACCEPTED",
      requestedById: input.requestedById,
      respondedById: input.respondedById ?? input.requestedById,
    },
  });
  return { id: row.id, orgAId: row.orgAId, orgBId: row.orgBId };
}

export async function createActiveShareGrant(input: {
  resourceType: "TICKET" | "PULL_REQUEST";
  resourceId: string;
  ownerOrgId: string;
  granteeOrgId: string;
  grantedToUserId: string;
  grantedByUserId: string;
  orgConnectionId: string;
}): Promise<{ id: string }> {
  const grant = await ownerDb.shareGrant.create({
    data: {
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      ownerOrgId: input.ownerOrgId,
      granteeOrgId: input.granteeOrgId,
      grantedToUserId: input.grantedToUserId,
      grantedByUserId: input.grantedByUserId,
      orgConnectionId: input.orgConnectionId,
      status: "ACTIVE",
    },
  });
  return { id: grant.id };
}

/**
 * Two orgs with ACCEPTED connection plus typical principals for share tests.
 * Owner org = orgA (Alice admin); partner = orgB (Carol admin, Eve agent).
 * Dave is multi-org (REVIEWER on both). Frank is CROSS_ORG_GUEST on orgA.
 */
export async function createConnectedShareWorld(input?: {
  orgAName?: string;
  orgBName?: string;
}): Promise<{
  orgA: FixtureOrg;
  orgB: FixtureOrg;
  connection: AcceptedConnection;
  alice: FixtureUser;
  carol: FixtureUser;
  eve: FixtureUser;
  dave: FixtureUser;
  frank: FixtureUser;
  bob: FixtureUser;
}> {
  const orgA = await createOrg(input?.orgAName ?? "Share Org A");
  const orgB = await createOrg(input?.orgBName ?? "Share Org B");

  const alice = await createUser({
    name: "Alice Admin",
    orgs: [{ org: orgA, role: "ORG_ADMIN" as OrgRole }],
  });
  const bob = await createUser({
    name: "Bob Agent",
    orgs: [{ org: orgA, role: "SUPPORT_AGENT" as OrgRole }],
  });
  const carol = await createUser({
    name: "Carol Admin",
    orgs: [{ org: orgB, role: "ORG_ADMIN" as OrgRole }],
  });
  const eve = await createUser({
    name: "Eve Agent",
    orgs: [{ org: orgB, role: "SUPPORT_AGENT" as OrgRole }],
  });
  const dave = await createUser({
    name: "Dave Multi",
    orgs: [
      { org: orgA, role: "REVIEWER" as OrgRole },
      { org: orgB, role: "REVIEWER" as OrgRole },
    ],
  });
  const frank = await createUser({
    name: "Frank Guest",
    orgs: [{ org: orgA, role: "CROSS_ORG_GUEST" as OrgRole }],
  });

  const connection = await createAcceptedConnection({
    orgA,
    orgB,
    requestedById: alice.id,
    respondedById: carol.id,
  });

  return { orgA, orgB, connection, alice, carol, eve, dave, frank, bob };
}

export async function createSharedTicket(input: {
  ownerOrg: FixtureOrg;
  granteeOrg: FixtureOrg;
  createdById: string;
  grantedToUserId: string;
  grantedByUserId: string;
  orgConnectionId: string;
  title?: string;
  assigneeId?: string | null;
}): Promise<{ ticketId: string; shareId: string; unsharedSiblingId: string }> {
  const shared = await createTicket({
    orgId: input.ownerOrg.id,
    createdById: input.createdById,
    title: input.title ?? "Shared ticket",
    assigneeId: input.assigneeId,
  });
  const unshared = await createTicket({
    orgId: input.ownerOrg.id,
    createdById: input.createdById,
    title: "Unshared sibling ticket",
  });
  const grant = await createActiveShareGrant({
    resourceType: "TICKET",
    resourceId: shared.id,
    ownerOrgId: input.ownerOrg.id,
    granteeOrgId: input.granteeOrg.id,
    grantedToUserId: input.grantedToUserId,
    grantedByUserId: input.grantedByUserId,
    orgConnectionId: input.orgConnectionId,
  });
  return {
    ticketId: shared.id,
    shareId: grant.id,
    unsharedSiblingId: unshared.id,
  };
}

export async function createSharedPr(input: {
  ownerOrg: FixtureOrg;
  granteeOrg: FixtureOrg;
  createdById: string;
  grantedToUserId: string;
  grantedByUserId: string;
  orgConnectionId: string;
  title?: string;
}): Promise<{ prId: string; shareId: string; unsharedSiblingId: string }> {
  const shared = await createPullRequest({
    orgId: input.ownerOrg.id,
    authorId: input.createdById,
    title: input.title ?? "Shared PR",
  });
  const unshared = await createPullRequest({
    orgId: input.ownerOrg.id,
    authorId: input.createdById,
    title: "Unshared sibling PR",
  });
  const grant = await createActiveShareGrant({
    resourceType: "PULL_REQUEST",
    resourceId: shared.id,
    ownerOrgId: input.ownerOrg.id,
    granteeOrgId: input.granteeOrg.id,
    grantedToUserId: input.grantedToUserId,
    grantedByUserId: input.grantedByUserId,
    orgConnectionId: input.orgConnectionId,
  });
  return {
    prId: shared.id,
    shareId: grant.id,
    unsharedSiblingId: unshared.id,
  };
}
