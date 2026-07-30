import { OrgRole, PrReviewDecision, PrStatus } from "@unified/types";
import { afterAll, describe, expect, it } from "vitest";
import { ownerDb } from "../../support/db.js";
import {
  cleanupRunFixtures,
  createOrg,
  createUser,
} from "../../support/fixtures.js";
import {
  createConnectedShareWorld,
  createSharedPr,
} from "../../support/share-fixtures.js";
import { loginAgent } from "../../support/http.js";
import {
  assertOwnerAliveAttackerDenyOwnerUnchanged,
  snapshotPr,
} from "../../support/product-bola-helpers.js";

describe("product BOLA PR nested routes", () => {
  afterAll(async () => {
    await cleanupRunFixtures();
  });

  it("pr.get.foreign.admin: foreign ORG_ADMIN GET returns 404", async () => {
    const orgA = await createOrg("Acme");
    const orgB = await createOrg("Globex");
    const alice = await createUser({
      orgs: [{ org: orgA, role: OrgRole.ORG_ADMIN }],
    });
    const carol = await createUser({
      orgs: [{ org: orgB, role: OrgRole.ORG_ADMIN }],
    });

    const aliceClient = await loginAgent(alice.email);
    const carolClient = await loginAgent(carol.email);

    const created = await aliceClient
      .post("/prs")
      .set("Content-Type", "application/json")
      .send({ title: "Acme-only PR", description: "secret" })
      .expect(201);

    const res = await carolClient.get(`/prs/${created.body.id}`);
    expect(res.status).toBe(404);
    expect(JSON.stringify(res.body)).not.toContain("Acme-only PR");
  });

  it("pr.patch.foreign.admin: foreign ORG_ADMIN PATCH returns 404 and ownerDb unchanged", async () => {
    const orgA = await createOrg("Acme");
    const orgB = await createOrg("Globex");
    const alice = await createUser({
      orgs: [{ org: orgA, role: OrgRole.ORG_ADMIN }],
    });
    const carol = await createUser({
      orgs: [{ org: orgB, role: OrgRole.ORG_ADMIN }],
    });

    const aliceClient = await loginAgent(alice.email);
    const carolClient = await loginAgent(carol.email);

    const created = await aliceClient
      .post("/prs")
      .set("Content-Type", "application/json")
      .send({ title: "Immutable from Globex" })
      .expect(201);

    await assertOwnerAliveAttackerDenyOwnerUnchanged({
      ownerAgent: aliceClient,
      ownerGetPath: `/prs/${created.body.id}`,
      attack: () =>
        carolClient
          .patch(`/prs/${created.body.id}`)
          .set("Content-Type", "application/json")
          .send({ title: "Hijacked" }),
      snapshot: () => snapshotPr(created.body.id),
      expectEqual: (before, after) => expect(after).toEqual(before),
      expectAttackStatus: 404,
      forbiddenBodySubstrings: ["Immutable from Globex"],
    });
  });

  it("pr.review.foreign.admin: foreign ORG_ADMIN review returns 404 and ownerDb unchanged", async () => {
    const orgA = await createOrg("Acme");
    const orgB = await createOrg("Globex");
    const alice = await createUser({
      orgs: [{ org: orgA, role: OrgRole.ORG_ADMIN }],
    });
    const dave = await createUser({
      orgs: [{ org: orgA, role: OrgRole.REVIEWER }],
    });
    const carol = await createUser({
      orgs: [{ org: orgB, role: OrgRole.ORG_ADMIN }],
    });

    const aliceClient = await loginAgent(alice.email);
    const carolClient = await loginAgent(carol.email);

    const created = await aliceClient
      .post("/prs")
      .set("Content-Type", "application/json")
      .send({
        title: "In review PR",
        reviewerIds: [dave.id],
      })
      .expect(201);

    await aliceClient
      .post(`/prs/${created.body.id}/transition`)
      .set("Content-Type", "application/json")
      .send({ to: PrStatus.IN_REVIEW })
      .expect(200);

    const reviewCountBefore = await ownerDb.prReview.count({
      where: { pullRequestId: created.body.id },
    });

    await assertOwnerAliveAttackerDenyOwnerUnchanged({
      ownerAgent: aliceClient,
      ownerGetPath: `/prs/${created.body.id}`,
      attack: () =>
        carolClient
          .post(`/prs/${created.body.id}/reviews`)
          .set("Content-Type", "application/json")
          .send({ decision: PrReviewDecision.APPROVE }),
      snapshot: () => snapshotPr(created.body.id),
      expectEqual: (before, after) => expect(after).toEqual(before),
      expectAttackStatus: 404,
    });

    const reviewCountAfter = await ownerDb.prReview.count({
      where: { pullRequestId: created.body.id },
    });
    expect(reviewCountAfter).toBe(reviewCountBefore);
  });

  it("pr.transition.foreign.admin: foreign ORG_ADMIN transition returns 404 and ownerDb unchanged", async () => {
    const orgA = await createOrg("Acme");
    const orgB = await createOrg("Globex");
    const alice = await createUser({
      orgs: [{ org: orgA, role: OrgRole.ORG_ADMIN }],
    });
    const carol = await createUser({
      orgs: [{ org: orgB, role: OrgRole.ORG_ADMIN }],
    });

    const aliceClient = await loginAgent(alice.email);
    const carolClient = await loginAgent(carol.email);

    const created = await aliceClient
      .post("/prs")
      .set("Content-Type", "application/json")
      .send({ title: "Transition locked PR" })
      .expect(201);

    await assertOwnerAliveAttackerDenyOwnerUnchanged({
      ownerAgent: aliceClient,
      ownerGetPath: `/prs/${created.body.id}`,
      attack: () =>
        carolClient
          .post(`/prs/${created.body.id}/transition`)
          .set("Content-Type", "application/json")
          .send({ to: PrStatus.IN_REVIEW }),
      snapshot: () => snapshotPr(created.body.id),
      expectEqual: (before, after) => expect(after).toEqual(before),
      expectAttackStatus: 404,
    });
  });

  it("pr.versions.foreign.admin: foreign ORG_ADMIN GET /versions returns 404", async () => {
    const orgA = await createOrg("Acme");
    const orgB = await createOrg("Globex");
    const alice = await createUser({
      orgs: [{ org: orgA, role: OrgRole.ORG_ADMIN }],
    });
    const carol = await createUser({
      orgs: [{ org: orgB, role: OrgRole.ORG_ADMIN }],
    });

    const aliceClient = await loginAgent(alice.email);
    const carolClient = await loginAgent(carol.email);

    const created = await aliceClient
      .post("/prs")
      .set("Content-Type", "application/json")
      .send({ title: "Versioned secret PR" })
      .expect(201);

    const path = `/prs/${created.body.id}/versions`;
    expect(path).toContain("/versions");
    await carolClient.get(path).expect(404);
  });

  it("pr.diff.foreign.admin: foreign ORG_ADMIN GET /diff returns 404", async () => {
    const orgA = await createOrg("Acme");
    const orgB = await createOrg("Globex");
    const alice = await createUser({
      orgs: [{ org: orgA, role: OrgRole.ORG_ADMIN }],
    });
    const carol = await createUser({
      orgs: [{ org: orgB, role: OrgRole.ORG_ADMIN }],
    });

    const aliceClient = await loginAgent(alice.email);
    const carolClient = await loginAgent(carol.email);

    const created = await aliceClient
      .post("/prs")
      .set("Content-Type", "application/json")
      .send({ title: "Diff secret PR" })
      .expect(201);

    const path = `/prs/${created.body.id}/versions/1/diff`;
    expect(path).toContain("/diff");
    await carolClient.get(path).expect(404);
  });

  it("pr.versions.share.holder: Eve GET /prs/:id/versions returns 200", async () => {
    const world = await createConnectedShareWorld();
    const shared = await createSharedPr({
      ownerOrg: world.orgA,
      granteeOrg: world.orgB,
      createdById: world.alice.id,
      grantedToUserId: world.eve.id,
      grantedByUserId: world.alice.id,
      orgConnectionId: world.connection.id,
      title: "Shared PR versions",
    });

    const eveClient = await loginAgent(world.eve.email);
    const path = `/prs/${shared.prId}/versions`;
    expect(path).toContain("/versions");
    const res = await eveClient.get(path).expect(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
  });

  it("pr.diff.share.holder: Eve GET /prs/:id/versions/:n/diff returns 200", async () => {
    const world = await createConnectedShareWorld();
    const shared = await createSharedPr({
      ownerOrg: world.orgA,
      granteeOrg: world.orgB,
      createdById: world.alice.id,
      grantedToUserId: world.eve.id,
      grantedByUserId: world.alice.id,
      orgConnectionId: world.connection.id,
      title: "Shared PR diff",
    });

    const eveClient = await loginAgent(world.eve.email);
    const path = `/prs/${shared.prId}/versions/1/diff`;
    expect(path).toContain("/diff");
    await eveClient.get(path).expect(200);
  });

  it("pr.versions.share.sibling: Eve GET sibling /versions returns 404", async () => {
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
    const path = `/prs/${shared.unsharedSiblingId}/versions`;
    expect(path).toContain("/versions");
    await eveClient.get(path).expect(404);
  });

  it("pr.mutator.eve.transition: Eve POST transition returns 403 and ownerDb unchanged", async () => {
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
    const eveClient = await loginAgent(world.eve.email);

    await assertOwnerAliveAttackerDenyOwnerUnchanged({
      ownerAgent: aliceClient,
      ownerGetPath: `/prs/${shared.prId}`,
      attack: async () => {
        const res = await eveClient
          .post(`/prs/${shared.prId}/transition`)
          .set("Content-Type", "application/json")
          .send({ to: PrStatus.IN_REVIEW });
        expect(res.body.code).toBe("insufficient_role");
        return res;
      },
      snapshot: () => snapshotPr(shared.prId),
      expectEqual: (before, after) => expect(after).toEqual(before),
      expectAttackStatus: 403,
    });
  });

  it("pr.mutator.eve.review: Eve POST reviews returns 403 and ownerDb unchanged", async () => {
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
    const eveClient = await loginAgent(world.eve.email);

    await aliceClient
      .post(`/prs/${shared.prId}/transition`)
      .set("Content-Type", "application/json")
      .send({ to: PrStatus.IN_REVIEW })
      .expect(200);

    const reviewCountBefore = await ownerDb.prReview.count({
      where: { pullRequestId: shared.prId },
    });

    await assertOwnerAliveAttackerDenyOwnerUnchanged({
      ownerAgent: aliceClient,
      ownerGetPath: `/prs/${shared.prId}`,
      attack: async () => {
        const res = await eveClient
          .post(`/prs/${shared.prId}/reviews`)
          .set("Content-Type", "application/json")
          .send({ decision: PrReviewDecision.APPROVE });
        expect(res.body.code).toBe("insufficient_role");
        return res;
      },
      snapshot: () => snapshotPr(shared.prId),
      expectEqual: (before, after) => expect(after).toEqual(before),
      expectAttackStatus: 403,
    });

    const reviewCountAfter = await ownerDb.prReview.count({
      where: { pullRequestId: shared.prId },
    });
    expect(reviewCountAfter).toBe(reviewCountBefore);
  });

  it("pr.mutator.eve.patch: Eve PATCH returns 403 and ownerDb unchanged", async () => {
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
    const eveClient = await loginAgent(world.eve.email);

    await assertOwnerAliveAttackerDenyOwnerUnchanged({
      ownerAgent: aliceClient,
      ownerGetPath: `/prs/${shared.prId}`,
      attack: async () => {
        const res = await eveClient
          .patch(`/prs/${shared.prId}`)
          .set("Content-Type", "application/json")
          .send({ title: "Hijack PR" });
        expect(res.body.code).toBe("insufficient_role");
        return res;
      },
      snapshot: () => snapshotPr(shared.prId),
      expectEqual: (before, after) => expect(after).toEqual(before),
      expectAttackStatus: 403,
    });
  });
});
