import { OrgRole } from "@unified/types";
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

describe("product BOLA PR share matrix", () => {
  afterAll(async () => {
    await cleanupRunFixtures();
  });

  it("pr.create.bodyOrgId.ignored: forged body orgId ignored; DB uses session org", async () => {
    const orgA = await createOrg("Acme");
    const orgB = await createOrg("Globex");
    const alice = await createUser({
      orgs: [{ org: orgA, role: OrgRole.ORG_ADMIN }],
    });

    const aliceClient = await loginAgent(alice.email);

    const created = await aliceClient
      .post("/prs")
      .set("Content-Type", "application/json")
      .send({
        title: "Forged org probe",
        orgId: orgB.id,
      })
      .expect(201);

    expect(created.body.orgId).toBeUndefined();

    const row = await ownerDb.pullRequest.findUniqueOrThrow({
      where: { id: created.body.id },
    });
    expect(row.orgId).toBe(orgA.id);
    expect(row.orgId).not.toBe(orgB.id);
  });

  it("pr.list.eve.noOwnerOrgWiden: Eve GET /prs returns 403", async () => {
    const world = await createConnectedShareWorld();
    await createSharedPr({
      ownerOrg: world.orgA,
      granteeOrg: world.orgB,
      createdById: world.alice.id,
      grantedToUserId: world.eve.id,
      grantedByUserId: world.alice.id,
      orgConnectionId: world.connection.id,
    });

    const eveClient = await loginAgent(world.eve.email);
    await eveClient
      .get("/prs")
      .expect(403)
      .expect((res) => {
        expect(res.body.code).toBe("insufficient_role");
      });
  });

  it("pr.comment.list.foreign.noShare: list comments on foreign PR returns 404", async () => {
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

    const pr = await aliceClient
      .post("/prs")
      .set("Content-Type", "application/json")
      .send({ title: "Foreign comment list PR" })
      .expect(201);

    await carolClient.get(`/prs/${pr.body.id}/comments`).expect(404);
  });

  it("pr.comment.create.foreign.noShare: create comment on foreign PR returns 404", async () => {
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

    const pr = await aliceClient
      .post("/prs")
      .set("Content-Type", "application/json")
      .send({ title: "Foreign comment create PR" })
      .expect(201);

    await carolClient
      .post(`/prs/${pr.body.id}/comments`)
      .set("Content-Type", "application/json")
      .send({ body: "Should not land" })
      .expect(404);
  });

  it("pr.comment.share.sibling: Eve comments on unshared sibling PR returns 404", async () => {
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
      .get(`/prs/${shared.unsharedSiblingId}/comments`)
      .expect(404);
  });

  it("share.pr.revoke.reshare: revoke then reshare leaves one ACTIVE plus prior REVOKED", async () => {
    const world = await createConnectedShareWorld();
    const aliceClient = await loginAgent(world.alice.email);

    const pr = await aliceClient
      .post("/prs")
      .set("Content-Type", "application/json")
      .send({ title: "PR reshare target" })
      .expect(201);

    const first = await aliceClient
      .post(`/prs/${pr.body.id}/shares`)
      .set("Content-Type", "application/json")
      .send({
        recipientUserId: world.eve.id,
        partnerOrgSlug: world.orgB.slug,
      })
      .expect(201);

    await aliceClient.delete(`/shares/${first.body.id}`).expect(200);

    const second = await aliceClient
      .post(`/prs/${pr.body.id}/shares`)
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
        resourceType: "PULL_REQUEST",
        resourceId: pr.body.id,
        grantedToUserId: world.eve.id,
      },
      orderBy: { createdAt: "asc" },
    });
    expect(rows).toHaveLength(2);
    expect(rows.filter((r) => r.status === "ACTIVE")).toHaveLength(1);
    expect(rows.filter((r) => r.status === "REVOKED")).toHaveLength(1);
  });

  it("share.pr.sameOrg.400: same-org PR share returns 400", async () => {
    const world = await createConnectedShareWorld();
    const aliceClient = await loginAgent(world.alice.email);

    const pr = await aliceClient
      .post("/prs")
      .set("Content-Type", "application/json")
      .send({ title: "Same-org share attempt" })
      .expect(201);

    await aliceClient
      .post(`/prs/${pr.body.id}/shares`)
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
});
