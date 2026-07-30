import { afterAll, describe, expect, it } from "vitest";
import { ownerDb } from "../support/db.js";
import { cleanupRunFixtures } from "../support/fixtures.js";
import {
  createConnectedShareWorld,
  createSharedPr,
} from "../support/share-fixtures.js";
import { loginAgent } from "../support/http.js";

describe("PR comments", () => {
  afterAll(async () => {
    await cleanupRunFixtures();
  });

  it("member can list and create PR comments with owner orgId", async () => {
    const world = await createConnectedShareWorld();
    const aliceClient = await loginAgent(world.alice.email);
    const pr = await aliceClient
      .post("/prs")
      .set("Content-Type", "application/json")
      .send({ title: "Commentable PR" })
      .expect(201);

    const created = await aliceClient
      .post(`/prs/${pr.body.id}/comments`)
      .set("Content-Type", "application/json")
      .send({ body: "Owner note" })
      .expect(201);

    expect(created.body.orgId).toBe(world.orgA.id);
    expect(created.body.authorOrgId).toBe(world.orgA.id);
    expect(created.body.pullRequestId).toBe(pr.body.id);

    const listed = await aliceClient
      .get(`/prs/${pr.body.id}/comments`)
      .expect(200);
    expect(
      (listed.body.comments as Array<{ id: string }>).map((c) => c.id),
    ).toContain(created.body.id);
  });

  it("2. Shared PR comment orgId is owner org; authorOrgId is session org", async () => {
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
    const created = await eveClient
      .post(`/prs/${shared.prId}/comments`)
      .set("Content-Type", "application/json")
      .send({ body: "Eve on shared PR" })
      .expect(201);

    expect(created.body.orgId).toBe(world.orgA.id);
    expect(created.body.authorOrgId).toBe(world.orgB.id);
    expect(created.body.authorId).toBe(world.eve.id);

    const row = await ownerDb.prComment.findUniqueOrThrow({
      where: { id: created.body.id },
    });
    expect(row.orgId).toBe(world.orgA.id);
    expect(row.authorOrgId).toBe(world.orgB.id);

    await eveClient.get(`/prs/${shared.unsharedSiblingId}/comments`).expect(404);
  });

  it("7. Owner commentsEnabled=false blocks shared PR comments", async () => {
    const world = await createConnectedShareWorld();
    const shared = await createSharedPr({
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

    const eveClient = await loginAgent(world.eve.email);
    await eveClient
      .post(`/prs/${shared.prId}/comments`)
      .set("Content-Type", "application/json")
      .send({ body: "Blocked by owner flags" })
      .expect(403);
  });

  it("CROSS_ORG_GUEST has no in-org PR comment access", async () => {
    const world = await createConnectedShareWorld();
    const aliceClient = await loginAgent(world.alice.email);
    const pr = await aliceClient
      .post("/prs")
      .set("Content-Type", "application/json")
      .send({ title: "Guest blocked PR" })
      .expect(201);

    const frankClient = await loginAgent(world.frank.email);
    await frankClient.get(`/prs/${pr.body.id}/comments`).expect(404);
    await frankClient
      .post(`/prs/${pr.body.id}/comments`)
      .set("Content-Type", "application/json")
      .send({ body: "Nope" })
      .expect(404);
  });
});
