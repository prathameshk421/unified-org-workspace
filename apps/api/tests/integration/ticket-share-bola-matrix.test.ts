import { PrReviewDecision, PrStatus } from "@unified/types";
import { afterAll, describe, expect, it } from "vitest";
import { ownerDb } from "../support/db.js";
import {
  cleanupRunFixtures,
  createOrg,
  createTicket,
} from "../support/fixtures.js";
import {
  createConnectedShareWorld,
  createSharedPr,
  createSharedTicket,
} from "../support/share-fixtures.js";
import { loginAgent } from "../support/http.js";

/**
 * Hostile BOLA must-haves for ticket share path (plan §7 items 1–2, 6–8, 13–14).
 * Connection/share CRUD coverage lives in sibling suites.
 */
describe("ticket share BOLA matrix", () => {
  afterAll(async () => {
    await cleanupRunFixtures();
  });

  it("1. Dave grant granteeOrg=A; wrong activeOrg → 404; activeOrg=A → 200", async () => {
    const world = await createConnectedShareWorld();
    // Share orgB-owned ticket to Dave with granteeOrg = orgA
    const shared = await createSharedTicket({
      ownerOrg: world.orgB,
      granteeOrg: world.orgA,
      createdById: world.carol.id,
      grantedToUserId: world.dave.id,
      grantedByUserId: world.carol.id,
      orgConnectionId: world.connection.id,
      title: "Dave grantee-org scoped ticket",
    });

    const daveClient = await loginAgent(world.dave.email);
    // Default active org is first membership (orgA) — should succeed via share path
    await daveClient.get(`/tickets/${shared.ticketId}`).expect(200);

    // Wrong org must be neither owner nor grantee — owner-org membership
    // correctly takes the member path (200), which is not the share-path BOLA case.
    const wrongOrg = await createOrg("Dave Wrong Org");
    await ownerDb.orgMembership.create({
      data: {
        userId: world.dave.id,
        orgId: wrongOrg.id,
        role: "REVIEWER",
        acceptedAt: new Date(),
      },
    });

    await daveClient
      .post("/auth/switch-org")
      .set("Content-Type", "application/json")
      .send({ orgId: wrongOrg.id })
      .expect(200);

    await daveClient.get(`/tickets/${shared.ticketId}`).expect(404);
  });

  it("2. Comment orgId always equals owner org (Eve-authored shared comment)", async () => {
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
    const created = await eveClient
      .post(`/tickets/${shared.ticketId}/comments`)
      .set("Content-Type", "application/json")
      .send({ body: "Eve shared-path note" })
      .expect(201);

    expect(created.body.orgId).toBe(world.orgA.id);
    expect(created.body.authorId).toBe(world.eve.id);

    const row = await ownerDb.ticketComment.findUniqueOrThrow({
      where: { id: created.body.id },
    });
    expect(row.orgId).toBe(world.orgA.id);
  });

  it("6. Removing grantee membership → next shared access 404", async () => {
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

    await ownerDb.orgMembership.delete({
      where: {
        userId_orgId: { userId: world.eve.id, orgId: world.orgB.id },
      },
    });

    await eveClient.get(`/tickets/${shared.ticketId}`).expect(404);
  });

  it("7. Owner commentsEnabled=false blocks shared comment even if guest home allows", async () => {
    const world = await createConnectedShareWorld();
    const shared = await createSharedTicket({
      ownerOrg: world.orgA,
      granteeOrg: world.orgB,
      createdById: world.alice.id,
      grantedToUserId: world.eve.id,
      grantedByUserId: world.alice.id,
      orgConnectionId: world.connection.id,
    });

    await ownerDb.organization.update({
      where: { id: world.orgA.id },
      data: {
        settings: {
          featureFlags: { commentsEnabled: false, attachmentsEnabled: true },
        },
      },
    });
    await ownerDb.organization.update({
      where: { id: world.orgB.id },
      data: {
        settings: {
          featureFlags: { commentsEnabled: true, attachmentsEnabled: true },
        },
      },
    });

    const eveClient = await loginAgent(world.eve.email);
    await eveClient
      .post(`/tickets/${shared.ticketId}/comments`)
      .set("Content-Type", "application/json")
      .send({ body: "Should be blocked by owner flag" })
      .expect(403);
  });

  it("8. Shared attachment download OK; unshared sibling attachment 404", async () => {
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
    const sharedUpload = await aliceClient
      .post(`/tickets/${shared.ticketId}/attachments`)
      .attach("file", Buffer.from("shared-bytes"), "shared.txt")
      .expect(201);
    const siblingUpload = await aliceClient
      .post(`/tickets/${shared.unsharedSiblingId}/attachments`)
      .attach("file", Buffer.from("sibling-bytes"), "sibling.txt")
      .expect(201);

    const eveClient = await loginAgent(world.eve.email);
    const download = await eveClient
      .get(
        `/tickets/${shared.ticketId}/attachments/${sharedUpload.body.id}/download`,
      )
      .expect(200);
    expect(download.text).toBe("shared-bytes");

    await eveClient
      .get(
        `/tickets/${shared.unsharedSiblingId}/attachments/${siblingUpload.body.id}/download`,
      )
      .expect(404);
  });

  it("13. Share-only holder cannot mutate / upload / review / transition", async () => {
    const world = await createConnectedShareWorld();
    const shared = await createSharedTicket({
      ownerOrg: world.orgA,
      granteeOrg: world.orgB,
      createdById: world.alice.id,
      grantedToUserId: world.eve.id,
      grantedByUserId: world.alice.id,
      orgConnectionId: world.connection.id,
    });
    const sharedPr = await createSharedPr({
      ownerOrg: world.orgA,
      granteeOrg: world.orgB,
      createdById: world.alice.id,
      grantedToUserId: world.eve.id,
      grantedByUserId: world.alice.id,
      orgConnectionId: world.connection.id,
    });

    const eveClient = await loginAgent(world.eve.email);

    await eveClient
      .patch(`/tickets/${shared.ticketId}`)
      .set("Content-Type", "application/json")
      .send({ title: "Hijack" })
      .expect(404);

    await eveClient
      .patch(`/tickets/${shared.ticketId}/status`)
      .set("Content-Type", "application/json")
      .send({ status: "IN_PROGRESS" })
      .expect(404);

    await eveClient.delete(`/tickets/${shared.ticketId}`).expect(404);

    await eveClient
      .post(`/tickets/${shared.ticketId}/attachments`)
      .attach("file", Buffer.from("nope"), "nope.txt")
      .expect(404);

    // Eve is SUPPORT_AGENT → PR mutator role gate → exact 403 insufficient_role.
    const prBefore = await ownerDb.pullRequest.findUniqueOrThrow({
      where: { id: sharedPr.prId },
      select: { title: true, status: true, description: true, currentVersion: true },
    });

    await eveClient
      .patch(`/prs/${sharedPr.prId}`)
      .set("Content-Type", "application/json")
      .send({ title: "Hijack PR" })
      .expect(403)
      .expect((res) => {
        expect(res.body.code).toBe("insufficient_role");
      });

    await eveClient
      .post(`/prs/${sharedPr.prId}/transition`)
      .set("Content-Type", "application/json")
      .send({ to: PrStatus.IN_REVIEW })
      .expect(403)
      .expect((res) => {
        expect(res.body.code).toBe("insufficient_role");
      });

    await eveClient
      .post(`/prs/${sharedPr.prId}/reviews`)
      .set("Content-Type", "application/json")
      .send({ decision: PrReviewDecision.APPROVE })
      .expect(403)
      .expect((res) => {
        expect(res.body.code).toBe("insufficient_role");
      });

    const prAfter = await ownerDb.pullRequest.findUniqueOrThrow({
      where: { id: sharedPr.prId },
      select: { title: true, status: true, description: true, currentVersion: true },
    });
    expect(prAfter).toEqual(prBefore);
  });

  it("14. Guest (Frank) list = assignee only; unassigned tickets 404", async () => {
    const world = await createConnectedShareWorld();
    const assigned = await createTicket({
      orgId: world.orgA.id,
      createdById: world.alice.id,
      title: "Frank assigned",
      assigneeId: world.frank.id,
    });
    const unassigned = await createTicket({
      orgId: world.orgA.id,
      createdById: world.alice.id,
      title: "Frank must not see",
      assigneeId: null,
    });

    const frankClient = await loginAgent(world.frank.email);
    const list = await frankClient.get("/tickets").expect(200);
    const ids = (list.body.tickets as Array<{ id: string }>).map((t) => t.id);
    expect(ids).toContain(assigned.id);
    expect(ids).not.toContain(unassigned.id);

    await frankClient.get(`/tickets/${assigned.id}`).expect(200);
    await frankClient.get(`/tickets/${unassigned.id}`).expect(404);

    // Org settings removed from CROSS_ORG_GUEST readers
    await frankClient
      .get("/org/settings")
      .expect(403)
      .expect((res) => {
        expect(res.body.code).toBe("insufficient_role");
      });
  });
});
