import { afterAll, describe, expect, it } from "vitest";
import { ownerDb } from "../support/db.js";
import {
  cleanupRunFixtures,
  createTicket,
} from "../support/fixtures.js";
import {
  createConnectedShareWorld,
  createSharedTicket,
} from "../support/share-fixtures.js";
import { loginAgent } from "../support/http.js";

describe("item shares — tickets", () => {
  afterAll(async () => {
    await cleanupRunFixtures();
  });

  it("creates ticket share via API and lists outbound on ticket", async () => {
    const world = await createConnectedShareWorld();
    const ticket = await createTicket({
      orgId: world.orgA.id,
      createdById: world.alice.id,
      title: "API share target",
    });

    const aliceClient = await loginAgent(world.alice.email);
    const created = await aliceClient
      .post(`/tickets/${ticket.id}/shares`)
      .set("Content-Type", "application/json")
      .send({
        recipientUserId: world.eve.id,
        partnerOrgSlug: world.orgB.slug,
      })
      .expect(201);

    expect(created.body.status).toBe("ACTIVE");
    expect(created.body.granteeOrgId).toBe(world.orgB.id);
    expect(created.body.grantedToUserId).toBe(world.eve.id);
    expect(created.body.orgConnectionId).toBe(world.connection.id);

    const listed = await aliceClient
      .get(`/tickets/${ticket.id}/shares`)
      .expect(200);
    const ids = (listed.body.shares as Array<{ id: string }>).map((s) => s.id);
    expect(ids).toContain(created.body.id);
  });

  it("rejects same-org share with 400 same_org_share_not_supported", async () => {
    const world = await createConnectedShareWorld();
    const ticket = await createTicket({
      orgId: world.orgA.id,
      createdById: world.alice.id,
      title: "Same-org share attempt",
    });

    const aliceClient = await loginAgent(world.alice.email);
    await aliceClient
      .post(`/tickets/${ticket.id}/shares`)
      .set("Content-Type", "application/json")
      .send({
        recipientUserId: world.bob.id,
        partnerOrgSlug: world.orgA.slug,
      })
      .expect(400)
      .expect((res) => {
        expect(res.body.code).toBe("same_org_share_not_supported");
      });
  });

  it("revoke → re-share leaves one ACTIVE and prior REVOKED retained", async () => {
    const world = await createConnectedShareWorld();
    const ticket = await createTicket({
      orgId: world.orgA.id,
      createdById: world.alice.id,
      title: "Reshare target",
    });

    const aliceClient = await loginAgent(world.alice.email);
    const first = await aliceClient
      .post(`/tickets/${ticket.id}/shares`)
      .set("Content-Type", "application/json")
      .send({
        recipientUserId: world.eve.id,
        partnerOrgSlug: world.orgB.slug,
      })
      .expect(201);

    await aliceClient.delete(`/shares/${first.body.id}`).expect(200);

    const second = await aliceClient
      .post(`/tickets/${ticket.id}/shares`)
      .set("Content-Type", "application/json")
      .send({
        recipientUserId: world.eve.id,
        partnerOrgSlug: world.orgB.slug,
      })
      .expect(201);

    expect(second.body.id).not.toBe(first.body.id);
    expect(second.body.status).toBe("ACTIVE");

    const rows = await ownerDb.shareGrant.findMany({
      where: {
        resourceType: "TICKET",
        resourceId: ticket.id,
        grantedToUserId: world.eve.id,
      },
      orderBy: { createdAt: "asc" },
    });
    expect(rows).toHaveLength(2);
    expect(rows.filter((r) => r.status === "ACTIVE")).toHaveLength(1);
    expect(rows.filter((r) => r.status === "REVOKED")).toHaveLength(1);

    await aliceClient
      .post(`/tickets/${ticket.id}/shares`)
      .set("Content-Type", "application/json")
      .send({
        recipientUserId: world.eve.id,
        partnerOrgSlug: world.orgB.slug,
      })
      .expect(409)
      .expect((res) => {
        expect(res.body.code).toBe("share_already_active");
      });
  });

  it("inbound/outbound lists; grantee user and grantee admin can revoke", async () => {
    const world = await createConnectedShareWorld();
    const shared = await createSharedTicket({
      ownerOrg: world.orgA,
      granteeOrg: world.orgB,
      createdById: world.alice.id,
      grantedToUserId: world.eve.id,
      grantedByUserId: world.alice.id,
      orgConnectionId: world.connection.id,
    });

    const aliceClient = await loginAgent(world.alice.email);
    const outbound = await aliceClient.get("/shares/outbound").expect(200);
    const outboundIds = (outbound.body.shares as Array<{ id: string }>).map(
      (s) => s.id,
    );
    expect(outboundIds).toContain(shared.shareId);

    const eveClient = await loginAgent(world.eve.email);
    const inboundEve = await eveClient.get("/shares/inbound").expect(200);
    const inboundEveIds = (inboundEve.body.shares as Array<{ id: string }>).map(
      (s) => s.id,
    );
    expect(inboundEveIds).toContain(shared.shareId);

    await eveClient.delete(`/shares/${shared.shareId}`).expect(200);

    const afterEve = await ownerDb.shareGrant.findUniqueOrThrow({
      where: { id: shared.shareId },
    });
    expect(afterEve.status).toBe("REVOKED");

    const shared2 = await createSharedTicket({
      ownerOrg: world.orgA,
      granteeOrg: world.orgB,
      createdById: world.alice.id,
      grantedToUserId: world.eve.id,
      grantedByUserId: world.alice.id,
      orgConnectionId: world.connection.id,
      title: "Admin revoke target",
    });

    const carolClient = await loginAgent(world.carol.email);
    const inboundAdmin = await carolClient.get("/shares/inbound").expect(200);
    const adminIds = (inboundAdmin.body.shares as Array<{ id: string }>).map(
      (s) => s.id,
    );
    expect(adminIds).toContain(shared2.shareId);

    await carolClient.delete(`/shares/${shared2.shareId}`).expect(200);
  });

  it("shared inbox lists only ACTIVE grants for session grantee org", async () => {
    const world = await createConnectedShareWorld();
    const shared = await createSharedTicket({
      ownerOrg: world.orgA,
      granteeOrg: world.orgB,
      createdById: world.alice.id,
      grantedToUserId: world.eve.id,
      grantedByUserId: world.alice.id,
      orgConnectionId: world.connection.id,
    });

    const eveClient = await loginAgent(world.eve.email);
    const inbox = await eveClient.get("/shared/tickets").expect(200);
    const ids = (inbox.body.tickets as Array<{ id: string }>).map((t) => t.id);
    expect(ids).toContain(shared.ticketId);
    expect(ids).not.toContain(shared.unsharedSiblingId);
  });
});
