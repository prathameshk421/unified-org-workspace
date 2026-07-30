import { OrgRole, PrReviewDecision, PrStatus } from "@unified/types";
import { afterAll, describe, expect, it } from "vitest";
import { ownerDb } from "../support/db.js";
import { cleanupRunFixtures, createOrg, createUser } from "../support/fixtures.js";
import { loginAgent } from "../support/http.js";

describe("PR isolation", () => {
  afterAll(async () => {
    await cleanupRunFixtures();
  });

  it("rejects cross-org GET /prs/:id", async () => {
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

  it("rejects cross-org PATCH /prs/:id", async () => {
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

    const before = await ownerDb.pullRequest.findUniqueOrThrow({
      where: { id: created.body.id },
      select: {
        title: true,
        status: true,
        description: true,
        currentVersion: true,
      },
    });

    const res = await carolClient
      .patch(`/prs/${created.body.id}`)
      .set("Content-Type", "application/json")
      .send({ title: "Hijacked" });
    expect(res.status).toBe(404);

    const after = await ownerDb.pullRequest.findUniqueOrThrow({
      where: { id: created.body.id },
      select: {
        title: true,
        status: true,
        description: true,
        currentVersion: true,
      },
    });
    expect(after).toEqual(before);
  });

  it("rejects cross-org POST /prs/:id/reviews", async () => {
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

    const res = await carolClient
      .post(`/prs/${created.body.id}/reviews`)
      .set("Content-Type", "application/json")
      .send({ decision: PrReviewDecision.APPROVE });
    expect(res.status).toBe(404);

    const reviewCountAfter = await ownerDb.prReview.count({
      where: { pullRequestId: created.body.id },
    });
    expect(reviewCountAfter).toBe(reviewCountBefore);
  });

  it("lists only PRs from the active org", async () => {
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

    const acmePr = await aliceClient
      .post("/prs")
      .set("Content-Type", "application/json")
      .send({ title: "Acme PR" })
      .expect(201);

    const globexPr = await carolClient
      .post("/prs")
      .set("Content-Type", "application/json")
      .send({ title: "Globex PR" })
      .expect(201);

    const list = await aliceClient.get("/prs").expect(200);
    const ids = list.body.map((pr: { id: string }) => pr.id);

    expect(ids).toContain(acmePr.body.id);
    expect(ids).not.toContain(globexPr.body.id);
  });

  it("ignores forged orgId on create and stores session org only", async () => {
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

  it("rejects PR create for SUPPORT_AGENT with insufficient_role", async () => {
    const org = await createOrg("Acme");
    const bob = await createUser({
      orgs: [{ org, role: OrgRole.SUPPORT_AGENT }],
    });

    const bobClient = await loginAgent(bob.email);

    await bobClient
      .post("/prs")
      .set("Content-Type", "application/json")
      .send({ title: "Bob cannot create" })
      .expect(403)
      .expect((res) => {
        expect(res.body.code).toBe("insufficient_role");
      });
  });

  it("allows REVIEWER to create and approve in active org", async () => {
    const org = await createOrg("Acme");
    const dave = await createUser({
      orgs: [{ org, role: OrgRole.REVIEWER }],
    });

    const daveClient = await loginAgent(dave.email);

    const created = await daveClient
      .post("/prs")
      .set("Content-Type", "application/json")
      .send({
        title: "Dave reviewer PR",
        reviewerIds: [dave.id],
        requiresApprovals: 1,
      })
      .expect(201);

    await daveClient
      .post(`/prs/${created.body.id}/transition`)
      .set("Content-Type", "application/json")
      .send({ to: PrStatus.IN_REVIEW })
      .expect(200);

    const approved = await daveClient
      .post(`/prs/${created.body.id}/reviews`)
      .set("Content-Type", "application/json")
      .send({ decision: PrReviewDecision.APPROVE })
      .expect(200);

    expect(approved.body.status).toBe(PrStatus.APPROVED);
  });
});
