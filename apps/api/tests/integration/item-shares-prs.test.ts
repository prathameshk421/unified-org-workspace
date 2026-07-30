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
} from "../support/share-fixtures.js";
import { loginAgent } from "../support/http.js";

describe("item shares — PRs", () => {
  afterAll(async () => {
    await cleanupRunFixtures();
  });

  it("3. Eve SUPPORT_AGENT reads exactly shared PR; 404 siblings; no role widening", async () => {
    const world = await createConnectedShareWorld();
    const shared = await createSharedPr({
      ownerOrg: world.orgA,
      granteeOrg: world.orgB,
      createdById: world.alice.id,
      grantedToUserId: world.eve.id,
      grantedByUserId: world.alice.id,
      orgConnectionId: world.connection.id,
      title: "Shared with Eve",
    });

    const eveClient = await loginAgent(world.eve.email);

    const detail = await eveClient.get(`/prs/${shared.prId}`).expect(200);
    expect(detail.body.access).toBe("shared");
    expect(detail.body.id).toBe(shared.prId);

    await eveClient.get(`/prs/${shared.unsharedSiblingId}`).expect(404);

    // In-org PR list stays PR_MUTATOR_ROLES — SUPPORT_AGENT must not list owner-org PRs
    await eveClient.get("/prs").expect(403);

    const inbox = await eveClient.get("/shared/prs").expect(200);
    const ids = (inbox.body.prs as Array<{ id: string }>).map((p) => p.id);
    expect(ids).toContain(shared.prId);
    expect(ids).not.toContain(shared.unsharedSiblingId);
  });

  it("creates PR share via API (PR mutator) and blocks agent create", async () => {
    const world = await createConnectedShareWorld();
    const aliceClient = await loginAgent(world.alice.email);
    const bobClient = await loginAgent(world.bob.email);

    const pr = await aliceClient
      .post("/prs")
      .set("Content-Type", "application/json")
      .send({ title: "PR share API target" })
      .expect(201);

    await bobClient
      .post(`/prs/${pr.body.id}/shares`)
      .set("Content-Type", "application/json")
      .send({
        recipientUserId: world.eve.id,
        partnerOrgSlug: world.orgB.slug,
      })
      .expect(403);

    const created = await aliceClient
      .post(`/prs/${pr.body.id}/shares`)
      .set("Content-Type", "application/json")
      .send({
        recipientUserId: world.eve.id,
        partnerOrgSlug: world.orgB.slug,
      })
      .expect(201);

    expect(created.body.resourceType).toBe("PULL_REQUEST");
    expect(created.body.granteeOrgId).toBe(world.orgB.id);

    const listed = await aliceClient.get(`/prs/${pr.body.id}/shares`).expect(200);
    expect(
      (listed.body.shares as Array<{ id: string }>).map((s) => s.id),
    ).toContain(created.body.id);
  });

  it("Dave wrong active org cannot see shared PR; correct grantee org can", async () => {
    const world = await createConnectedShareWorld();
    const shared = await createSharedPr({
      ownerOrg: world.orgB,
      granteeOrg: world.orgA,
      createdById: world.carol.id,
      grantedToUserId: world.dave.id,
      grantedByUserId: world.carol.id,
      orgConnectionId: world.connection.id,
      title: "Dave PR share",
    });

    const daveClient = await loginAgent(world.dave.email);
    // Default first membership = orgA (grantee) → OK via share path
    await daveClient.get(`/prs/${shared.prId}`).expect(200);

    // Wrong org ≠ owner and ≠ grantee (owner membership would be member-path 200).
    const wrongOrg = await createOrg("Dave Wrong PR Org");
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

    await daveClient.get(`/prs/${shared.prId}`).expect(404);
  });

  it("share recipient cannot reach foreign tickets via PR share path", async () => {
    const world = await createConnectedShareWorld();
    await createSharedPr({
      ownerOrg: world.orgA,
      granteeOrg: world.orgB,
      createdById: world.alice.id,
      grantedToUserId: world.eve.id,
      grantedByUserId: world.alice.id,
      orgConnectionId: world.connection.id,
    });
    const foreignTicket = await createTicket({
      orgId: world.orgA.id,
      createdById: world.alice.id,
      title: "Not shared to Eve",
    });

    const eveClient = await loginAgent(world.eve.email);
    await eveClient.get(`/tickets/${foreignTicket.id}`).expect(404);
  });
});
