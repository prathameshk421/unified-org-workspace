import { afterAll, describe, it } from "vitest";
import { ownerDb } from "../../support/db.js";
import { cleanupRunFixtures } from "../../support/fixtures.js";
import {
  createConnectedShareWorld,
  createSharedPr,
  createSharedTicket,
} from "../../support/share-fixtures.js";
import { loginAgent } from "../../support/http.js";

describe("product BOLA membership drop nested", () => {
  afterAll(async () => {
    await cleanupRunFixtures();
  });

  it("ticket.attach.afterMembershipDrop: after Eve membership deleted list/meta/download return 404", async () => {
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
    const upload = await aliceClient
      .post(`/tickets/${shared.ticketId}/attachments`)
      .attach("file", Buffer.from("shared-bytes"), "shared.txt")
      .expect(201);

    const eveClient = await loginAgent(world.eve.email);
    await eveClient
      .get(`/tickets/${shared.ticketId}/attachments`)
      .expect(200);
    await eveClient
      .get(`/tickets/${shared.ticketId}/attachments/${upload.body.id}`)
      .expect(200);
    await eveClient
      .get(
        `/tickets/${shared.ticketId}/attachments/${upload.body.id}/download`,
      )
      .expect(200);

    await ownerDb.orgMembership.delete({
      where: {
        userId_orgId: { userId: world.eve.id, orgId: world.orgB.id },
      },
    });

    await eveClient
      .get(`/tickets/${shared.ticketId}/attachments`)
      .expect(404);
    await eveClient
      .get(`/tickets/${shared.ticketId}/attachments/${upload.body.id}`)
      .expect(404);
    await eveClient
      .get(
        `/tickets/${shared.ticketId}/attachments/${upload.body.id}/download`,
      )
      .expect(404);
  });

  it("pr.comment.afterMembershipDrop: after Eve membership deleted PR comments return 404", async () => {
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
    await eveClient
      .post(`/prs/${shared.prId}/comments`)
      .set("Content-Type", "application/json")
      .send({ body: "Eve comment before drop" })
      .expect(201);
    await eveClient.get(`/prs/${shared.prId}/comments`).expect(200);

    await ownerDb.orgMembership.delete({
      where: {
        userId_orgId: { userId: world.eve.id, orgId: world.orgB.id },
      },
    });

    await eveClient.get(`/prs/${shared.prId}/comments`).expect(404);
  });

  it("share.pr.membershipDrop: remove membership → shared PR GET returns 404", async () => {
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

    await ownerDb.orgMembership.delete({
      where: {
        userId_orgId: { userId: world.eve.id, orgId: world.orgB.id },
      },
    });

    await eveClient.get(`/prs/${shared.prId}`).expect(404);
  });
});
