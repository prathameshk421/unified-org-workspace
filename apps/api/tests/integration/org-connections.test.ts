import { OrgRole } from "@unified/types";
import { afterAll, describe, expect, it } from "vitest";
import { ownerDb } from "../support/db.js";
import { cleanupRunFixtures, createOrg, createUser } from "../support/fixtures.js";
import {
  canonicalOrgPair,
  createConnectedShareWorld,
  createSharedTicket,
} from "../support/share-fixtures.js";
import { loginAgent } from "../support/http.js";

describe("org connections", () => {
  afterAll(async () => {
    await cleanupRunFixtures();
  });

  it("REJECTED → re-request updates in place to one canonical PENDING row", async () => {
    const orgA = await createOrg("Conn Org A");
    const orgB = await createOrg("Conn Org B");
    const alice = await createUser({
      orgs: [{ org: orgA, role: OrgRole.ORG_ADMIN }],
    });
    const carol = await createUser({
      orgs: [{ org: orgB, role: OrgRole.ORG_ADMIN }],
    });

    const aliceClient = await loginAgent(alice.email);
    const carolClient = await loginAgent(carol.email);

    const created = await aliceClient
      .post("/connections")
      .set("Content-Type", "application/json")
      .send({ partnerOrgSlug: orgB.slug })
      .expect(201);

    await carolClient.post(`/connections/${created.body.id}/reject`).expect(200);

    const [orgAId, orgBId] = canonicalOrgPair(orgA.id, orgB.id);
    const rejected = await ownerDb.orgConnection.findUniqueOrThrow({
      where: { orgAId_orgBId: { orgAId, orgBId } },
    });
    expect(rejected.status).toBe("REJECTED");

    const rerequest = await aliceClient
      .post("/connections")
      .set("Content-Type", "application/json")
      .send({ partnerOrgSlug: orgB.slug })
      .expect(200);

    expect(rerequest.body.id).toBe(rejected.id);
    expect(rerequest.body.status).toBe("PENDING");

    const rows = await ownerDb.orgConnection.findMany({
      where: { orgAId, orgBId },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.status).toBe("PENDING");
  });

  it("recipients picker: mutator OK without email; non-mutator 403", async () => {
    const world = await createConnectedShareWorld();
    const aliceClient = await loginAgent(world.alice.email);
    const bobClient = await loginAgent(world.bob.email);
    const frankClient = await loginAgent(world.frank.email);

    const ok = await aliceClient
      .get(`/connections/${world.connection.id}/recipients`)
      .expect(200);

    expect(ok.body.recipients.length).toBeGreaterThan(0);
    for (const recipient of ok.body.recipients as Array<Record<string, unknown>>) {
      expect(recipient).toHaveProperty("userId");
      expect(recipient).toHaveProperty("name");
      expect(recipient).toHaveProperty("initials");
      expect(recipient).not.toHaveProperty("email");
      expect(JSON.stringify(recipient)).not.toMatch(/@/);
    }

    // SUPPORT_AGENT is a ticket mutator — recipients allowed
    await bobClient
      .get(`/connections/${world.connection.id}/recipients`)
      .expect(200);

    await frankClient
      .get(`/connections/${world.connection.id}/recipients`)
      .expect(403)
      .expect((res) => {
        expect(res.body.code).toBe("insufficient_role");
      });
  });

  it("SUPPORT_AGENT cannot manage connections; wrong-org admin cannot accept/revoke", async () => {
    const orgA = await createOrg("Admin Conn A");
    const orgB = await createOrg("Admin Conn B");
    const orgC = await createOrg("Admin Conn C");
    const alice = await createUser({
      orgs: [{ org: orgA, role: OrgRole.ORG_ADMIN }],
    });
    const bob = await createUser({
      orgs: [{ org: orgA, role: OrgRole.SUPPORT_AGENT }],
    });
    const carol = await createUser({
      orgs: [{ org: orgB, role: OrgRole.ORG_ADMIN }],
    });
    const outsider = await createUser({
      orgs: [{ org: orgC, role: OrgRole.ORG_ADMIN }],
    });

    const bobClient = await loginAgent(bob.email);
    await bobClient
      .post("/connections")
      .set("Content-Type", "application/json")
      .send({ partnerOrgSlug: orgB.slug })
      .expect(403)
      .expect((res) => {
        expect(res.body.code).toBe("insufficient_role");
      });

    const aliceClient = await loginAgent(alice.email);
    const created = await aliceClient
      .post("/connections")
      .set("Content-Type", "application/json")
      .send({ partnerOrgSlug: orgB.slug })
      .expect(201);

    const outsiderClient = await loginAgent(outsider.email);
    await outsiderClient
      .post(`/connections/${created.body.id}/accept`)
      .expect(404);
    await outsiderClient
      .post(`/connections/${created.body.id}/revoke`)
      .expect(404);

    await aliceClient
      .post(`/connections/${created.body.id}/accept`)
      .expect(403)
      .expect((res) => {
        expect(res.body.code).toBe("cannot_accept_own_request");
      });

    const carolClient = await loginAgent(carol.email);
    await carolClient.post(`/connections/${created.body.id}/accept`).expect(200);
  });

  it("platform admin can list-all and force-revoke with cascade", async () => {
    const world = await createConnectedShareWorld();
    const { ticketId } = await createSharedTicket({
      ownerOrg: world.orgA,
      granteeOrg: world.orgB,
      createdById: world.alice.id,
      grantedToUserId: world.eve.id,
      grantedByUserId: world.alice.id,
      orgConnectionId: world.connection.id,
    });

    const platform = await createUser({ isPlatformAdmin: true });
    const platformClient = await loginAgent(platform.email);

    const listed = await platformClient.get("/platform/connections").expect(200);
    const ids = (listed.body.connections as Array<{ id: string }>).map((c) => c.id);
    expect(ids).toContain(world.connection.id);

    await platformClient
      .post(`/platform/connections/${world.connection.id}/force-revoke`)
      .expect(200);

    const grant = await ownerDb.shareGrant.findFirst({
      where: { resourceId: ticketId },
    });
    expect(grant?.status).toBe("REVOKED");
    expect(grant?.revokeReason).toBe("connection_revoked");

    const conn = await ownerDb.orgConnection.findUniqueOrThrow({
      where: { id: world.connection.id },
    });
    expect(conn.status).toBe("REVOKED");
  });

  it("either-side ORG_ADMIN revoke cascades ACTIVE grants", async () => {
    const world = await createConnectedShareWorld();
    const shared = await createSharedTicket({
      ownerOrg: world.orgA,
      granteeOrg: world.orgB,
      createdById: world.alice.id,
      grantedToUserId: world.eve.id,
      grantedByUserId: world.alice.id,
      orgConnectionId: world.connection.id,
    });

    const carolClient = await loginAgent(world.carol.email);
    await carolClient
      .post(`/connections/${world.connection.id}/revoke`)
      .expect(200);

    const grant = await ownerDb.shareGrant.findUniqueOrThrow({
      where: { id: shared.shareId },
    });
    expect(grant.status).toBe("REVOKED");
    expect(grant.revokeReason).toBe("connection_revoked");
  });
});
