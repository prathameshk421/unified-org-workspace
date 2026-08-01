import { OrgRole } from "@unified/types";
import { afterAll, describe, expect, it } from "vitest";
import { ownerDb } from "../../support/db.js";
import {
  cleanupRunFixtures,
  createOrg,
  createPullRequest,
  createTicket,
  createUser,
} from "../../support/fixtures.js";
import {
  createAcceptedConnection,
  createConnectedShareWorld,
  createSharedPr,
  createSharedTicket,
} from "../../support/share-fixtures.js";
import { loginAgent } from "../../support/http.js";
import { assertOwnerDbUnchanged, snapshotShareGrant } from "../../support/product-bola-helpers.js";

describe("product BOLA share revoke access", () => {
  afterAll(async () => {
    await cleanupRunFixtures();
  });

  it("share.create.foreign.ticket: POST share under foreign ticket returns 404", async () => {
    const world = await createConnectedShareWorld();
    const ticket = await createTicket({
      orgId: world.orgA.id,
      createdById: world.alice.id,
      title: "Alice ticket foreign share probe",
    });

    const grantsBefore = await ownerDb.shareGrant.count({
      where: { resourceId: ticket.id },
    });

    const carolClient = await loginAgent(world.carol.email);
    await carolClient
      .post(`/tickets/${ticket.id}/shares`)
      .set("Content-Type", "application/json")
      .send({
        recipientUserId: world.eve.id,
        partnerOrgSlug: world.orgB.slug,
      })
      .expect(404);

    const grantsAfter = await ownerDb.shareGrant.count({
      where: { resourceId: ticket.id },
    });
    expect(grantsAfter).toBe(grantsBefore);
  });

  it("share.create.foreign.pr: POST share under foreign PR returns 404", async () => {
    const world = await createConnectedShareWorld();
    const pr = await createPullRequest({
      orgId: world.orgA.id,
      authorId: world.alice.id,
      title: "Alice PR foreign share probe",
    });

    const grantsBefore = await ownerDb.shareGrant.count({
      where: { resourceId: pr.id },
    });

    const carolClient = await loginAgent(world.carol.email);
    await carolClient
      .post(`/prs/${pr.id}/shares`)
      .set("Content-Type", "application/json")
      .send({
        recipientUserId: world.eve.id,
        partnerOrgSlug: world.orgB.slug,
      })
      .expect(404);

    const grantsAfter = await ownerDb.shareGrant.count({
      where: { resourceId: pr.id },
    });
    expect(grantsAfter).toBe(grantsBefore);
  });

  it("share.delete.outsider: unrelated DELETE shareId returns 404 and grant stays ACTIVE", async () => {
    const world = await createConnectedShareWorld();
    const shared = await createSharedTicket({
      ownerOrg: world.orgA,
      granteeOrg: world.orgB,
      createdById: world.alice.id,
      grantedToUserId: world.eve.id,
      grantedByUserId: world.alice.id,
      orgConnectionId: world.connection.id,
    });

    const orgC = await createOrg("Outsider Org");
    const outsider = await createUser({
      orgs: [{ org: orgC, role: OrgRole.ORG_ADMIN }],
    });

    const before = await snapshotShareGrant(shared.shareId);
    const outsiderClient = await loginAgent(outsider.email);

    await outsiderClient.delete(`/shares/${shared.shareId}`).expect(404);

    await assertOwnerDbUnchanged({
      before,
      snapshot: () => snapshotShareGrant(shared.shareId),
      expectEqual: (a, b) => expect(b).toEqual(a),
    });
    expect(before.status).toBe("ACTIVE");
  });

  it("share.delete.grantee.self: grantee deletes own inbound share → REVOKED", async () => {
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
    await eveClient.delete(`/shares/${shared.shareId}`).expect(200);

    const grant = await ownerDb.shareGrant.findUniqueOrThrow({
      where: { id: shared.shareId },
    });
    expect(grant.status).toBe("REVOKED");
  });

  it("share.delete.granteeAdmin: grantee ORG_ADMIN deletes peer share → REVOKED", async () => {
    const world = await createConnectedShareWorld();
    const shared = await createSharedTicket({
      ownerOrg: world.orgA,
      granteeOrg: world.orgB,
      createdById: world.alice.id,
      grantedToUserId: world.eve.id,
      grantedByUserId: world.alice.id,
      orgConnectionId: world.connection.id,
      title: "Peer revoke target",
    });

    const carolClient = await loginAgent(world.carol.email);
    await carolClient.delete(`/shares/${shared.shareId}`).expect(200);

    const grant = await ownerDb.shareGrant.findUniqueOrThrow({
      where: { id: shared.shareId },
    });
    expect(grant.status).toBe("REVOKED");
  });

  it("share.revoke.then.get: after owner revoke grantee GET resource returns 404", async () => {
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
    await aliceClient.delete(`/shares/${shared.shareId}`).expect(200);

    const eveClient = await loginAgent(world.eve.email);
    await eveClient.get(`/tickets/${shared.ticketId}`).expect(404);
  });

  it("share.inbound.afterRevoke: GET /shares/inbound excludes revoked share id", async () => {
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
    await aliceClient.delete(`/shares/${shared.shareId}`).expect(200);

    const eveClient = await loginAgent(world.eve.email);
    const inbound = await eveClient.get("/shares/inbound").expect(200);
    const ids = (inbound.body.shares as Array<{ id: string }>).map((s) => s.id);
    expect(ids).not.toContain(shared.shareId);
  });

  it("share.sharedInbox.afterRevoke: GET /shared/tickets excludes revoked resource", async () => {
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
    await aliceClient.delete(`/shares/${shared.shareId}`).expect(200);

    const eveClient = await loginAgent(world.eve.email);
    const inbox = await eveClient.get("/shared/tickets").expect(200);
    const ids = (inbox.body.tickets as Array<{ id: string }>).map((t) => t.id);
    expect(ids).not.toContain(shared.ticketId);
  });

  it("share.sharedPrInbox.afterRevoke: GET /shared/prs excludes revoked resource", async () => {
    const world = await createConnectedShareWorld();
    const shared = await createSharedPr({
      ownerOrg: world.orgA,
      granteeOrg: world.orgB,
      createdById: world.alice.id,
      grantedToUserId: world.eve.id,
      grantedByUserId: world.alice.id,
      orgConnectionId: world.connection.id,
    });

    const aliceClient = await loginAgent(world.alice.email);
    await aliceClient.delete(`/shares/${shared.shareId}`).expect(200);

    const eveClient = await loginAgent(world.eve.email);
    const inbox = await eveClient.get("/shared/prs").expect(200);
    const ids = (inbox.body.prs as Array<{ id: string }>).map((pr) => pr.id);
    expect(ids).not.toContain(shared.prId);
  });

  it("share.pr.revoke.then.get: after owner revoke grantee PR GET returns 404", async () => {
    const world = await createConnectedShareWorld();
    const shared = await createSharedPr({
      ownerOrg: world.orgA,
      granteeOrg: world.orgB,
      createdById: world.alice.id,
      grantedToUserId: world.eve.id,
      grantedByUserId: world.alice.id,
      orgConnectionId: world.connection.id,
      title: "Revoked PR secret",
    });

    const aliceClient = await loginAgent(world.alice.email);
    await aliceClient.delete(`/shares/${shared.shareId}`).expect(200);

    const eveClient = await loginAgent(world.eve.email);
    const denied = await eveClient.get(`/prs/${shared.prId}`).expect(404);
    expect(denied.text).not.toContain("Revoked PR secret");
    await aliceClient.get(`/prs/${shared.prId}`).expect(200);
  });

  it("share.pr.inbound.afterRevoke: GET /shares/inbound excludes revoked PR share", async () => {
    const world = await createConnectedShareWorld();
    const shared = await createSharedPr({
      ownerOrg: world.orgA,
      granteeOrg: world.orgB,
      createdById: world.alice.id,
      grantedToUserId: world.eve.id,
      grantedByUserId: world.alice.id,
      orgConnectionId: world.connection.id,
    });

    const aliceClient = await loginAgent(world.alice.email);
    await aliceClient.delete(`/shares/${shared.shareId}`).expect(200);

    const eveClient = await loginAgent(world.eve.email);
    const inbound = await eveClient.get("/shares/inbound").expect(200);
    const ids = (inbound.body.shares as Array<{ id: string }>).map((share) => share.id);
    expect(ids).not.toContain(shared.shareId);
  });

  it("connection.pr.revoke.then.get: after connection revoke grantee PR GET returns 404", async () => {
    const world = await createConnectedShareWorld();
    const shared = await createSharedPr({
      ownerOrg: world.orgA,
      granteeOrg: world.orgB,
      createdById: world.alice.id,
      grantedToUserId: world.eve.id,
      grantedByUserId: world.alice.id,
      orgConnectionId: world.connection.id,
    });

    const eveClient = await loginAgent(world.eve.email);
    await eveClient.get(`/prs/${shared.prId}`).expect(200);

    const aliceClient = await loginAgent(world.alice.email);
    await aliceClient.post(`/connections/${world.connection.id}/revoke`).expect(200);

    await eveClient.get(`/prs/${shared.prId}`).expect(404);
    await aliceClient.get(`/prs/${shared.prId}`).expect(200);
  });

  it("connection.revoke.then.get: after connection revoke grantee GET returns 404", async () => {
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
    await eveClient.get(`/tickets/${shared.ticketId}`).expect(200);

    const aliceClient = await loginAgent(world.alice.email);
    await aliceClient.post(`/connections/${world.connection.id}/revoke`).expect(200);

    await eveClient.get(`/tickets/${shared.ticketId}`).expect(404);
  });

  it("connection.revoked.grantStillActive: ACTIVE grant + REVOKED connection → GET 404", async () => {
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
    await eveClient.get(`/tickets/${shared.ticketId}`).expect(200);

    const aliceClient = await loginAgent(world.alice.email);
    await aliceClient.post(`/connections/${world.connection.id}/revoke`).expect(200);

    // API cascade revokes grants; re-activate grant while connection stays REVOKED.
    await ownerDb.shareGrant.update({
      where: { id: shared.shareId },
      data: { status: "ACTIVE", revokeReason: null },
    });

    const before = await snapshotShareGrant(shared.shareId);
    expect(before.status).toBe("ACTIVE");

    await eveClient.get(`/tickets/${shared.ticketId}`).expect(404);

    await assertOwnerDbUnchanged({
      before,
      snapshot: () => snapshotShareGrant(shared.shareId),
      expectEqual: (a, b) => expect(b).toEqual(a),
    });

    const conn = await ownerDb.orgConnection.findUniqueOrThrow({
      where: { id: world.connection.id },
    });
    expect(conn.status).toBe("REVOKED");
  });

  it("platform.forceRevoke.then.get: after platform force-revoke Eve GET returns 404", async () => {
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
    await eveClient.get(`/tickets/${shared.ticketId}`).expect(200);

    const platform = await createUser({ isPlatformAdmin: true });
    const platformClient = await loginAgent(platform.email);
    await platformClient
      .post(`/platform/connections/${world.connection.id}/force-revoke`)
      .expect(200);

    await eveClient.get(`/tickets/${shared.ticketId}`).expect(404);
  });

  it("connection.recipients.foreignConnectionId: GET recipients for foreign connectionId returns 404", async () => {
    const world = await createConnectedShareWorld();

    const orgC = await createOrg("Foreign Conn C");
    const orgD = await createOrg("Foreign Conn D");
    const adminC = await createUser({
      orgs: [{ org: orgC, role: OrgRole.ORG_ADMIN }],
    });
    const adminD = await createUser({
      orgs: [{ org: orgD, role: OrgRole.ORG_ADMIN }],
    });
    const foreignConnection = await createAcceptedConnection({
      orgA: orgC,
      orgB: orgD,
      requestedById: adminC.id,
      respondedById: adminD.id,
    });

    const carolClient = await loginAgent(world.carol.email);
    await carolClient.get(`/connections/${foreignConnection.id}/recipients`).expect(404);
  });

  it("connection.list.noCrossOrgLeak: list includes only connections touching the session org", async () => {
    const world = await createConnectedShareWorld();
    const orgC = await createOrg("List Conn C");
    const orgD = await createOrg("List Conn D");
    const adminC = await createUser({
      orgs: [{ org: orgC, role: OrgRole.ORG_ADMIN }],
    });
    const adminD = await createUser({
      orgs: [{ org: orgD, role: OrgRole.ORG_ADMIN }],
    });
    const ownConnection = await createAcceptedConnection({
      orgA: orgC,
      orgB: orgD,
      requestedById: adminC.id,
      respondedById: adminD.id,
    });

    const adminCClient = await loginAgent(adminC.email);
    const listed = await adminCClient.get("/connections").expect(200);
    const ids = (listed.body.connections as Array<{ id: string }>).map(
      (connection) => connection.id,
    );
    expect(ids).toContain(ownConnection.id);
    expect(ids).not.toContain(world.connection.id);
    expect(JSON.stringify(listed.body)).not.toContain(world.orgA.slug);
    expect(JSON.stringify(listed.body)).not.toContain(world.orgB.slug);
  });

  it("connection.accept.foreignConnectionId: outsider accept returns 404 and connection unchanged", async () => {
    const orgA = await createOrg("Accept Conn A");
    const orgB = await createOrg("Accept Conn B");
    const outsiderOrg = await createOrg("Accept Outsider");
    const adminA = await createUser({
      orgs: [{ org: orgA, role: OrgRole.ORG_ADMIN }],
    });
    const outsider = await createUser({
      orgs: [{ org: outsiderOrg, role: OrgRole.ORG_ADMIN }],
    });
    const [orgAId, orgBId] = orgA.id < orgB.id ? [orgA.id, orgB.id] : [orgB.id, orgA.id];
    const connection = await ownerDb.orgConnection.create({
      data: {
        orgAId,
        orgBId,
        status: "PENDING",
        requestedById: adminA.id,
      },
    });
    const before = await ownerDb.orgConnection.findUniqueOrThrow({
      where: { id: connection.id },
    });

    const outsiderClient = await loginAgent(outsider.email);
    await outsiderClient.post(`/connections/${connection.id}/accept`).expect(404);

    await assertOwnerDbUnchanged({
      before,
      snapshot: () => ownerDb.orgConnection.findUniqueOrThrow({ where: { id: connection.id } }),
      expectEqual: (a, b) => expect(b).toEqual(a),
    });
  });

  it("connection.revoke.foreignConnectionId: outsider revoke returns 404 and connection unchanged", async () => {
    const orgA = await createOrg("Revoke Conn A");
    const orgB = await createOrg("Revoke Conn B");
    const outsiderOrg = await createOrg("Revoke Outsider");
    const adminA = await createUser({
      orgs: [{ org: orgA, role: OrgRole.ORG_ADMIN }],
    });
    const adminB = await createUser({
      orgs: [{ org: orgB, role: OrgRole.ORG_ADMIN }],
    });
    const outsider = await createUser({
      orgs: [{ org: outsiderOrg, role: OrgRole.ORG_ADMIN }],
    });
    const connection = await createAcceptedConnection({
      orgA,
      orgB,
      requestedById: adminA.id,
      respondedById: adminB.id,
    });
    const before = await ownerDb.orgConnection.findUniqueOrThrow({
      where: { id: connection.id },
    });

    const outsiderClient = await loginAgent(outsider.email);
    await outsiderClient.post(`/connections/${connection.id}/revoke`).expect(404);

    await assertOwnerDbUnchanged({
      before,
      snapshot: () => ownerDb.orgConnection.findUniqueOrThrow({ where: { id: connection.id } }),
      expectEqual: (a, b) => expect(b).toEqual(a),
    });
  });
});
