import { OrgRole, PrReviewDecision, PrStatus } from "@unified/types";
import { afterAll, describe, expect, it } from "vitest";
import { cleanupRunFixtures, createOrg, createUser } from "../support/fixtures.js";
import { loginAgent } from "../support/http.js";

describe("PR approval workflow", () => {
  afterAll(async () => {
    await cleanupRunFixtures();
  });

  it("keeps IN_REVIEW when one of two required approvals is received", async () => {
    const org = await createOrg("Acme");
    const alice = await createUser({
      orgs: [{ org, role: OrgRole.ORG_ADMIN }],
    });
    const dave = await createUser({
      orgs: [{ org, role: OrgRole.REVIEWER }],
    });
    const eve = await createUser({
      orgs: [{ org, role: OrgRole.REVIEWER }],
    });

    const aliceClient = await loginAgent(alice.email);
    const daveClient = await loginAgent(dave.email);

    const created = await aliceClient
      .post("/prs")
      .set("Content-Type", "application/json")
      .send({
        title: "Two approvals needed",
        requiresApprovals: 2,
        reviewerIds: [dave.id, eve.id],
      })
      .expect(201);

    await aliceClient
      .post(`/prs/${created.body.id}/transition`)
      .set("Content-Type", "application/json")
      .send({ to: PrStatus.IN_REVIEW })
      .expect(200);

    const afterOne = await daveClient
      .post(`/prs/${created.body.id}/reviews`)
      .set("Content-Type", "application/json")
      .send({ decision: PrReviewDecision.APPROVE })
      .expect(200);

    expect(afterOne.body.status).toBe(PrStatus.IN_REVIEW);
  });

  it("approves when a second distinct reviewer approves", async () => {
    const org = await createOrg("Acme");
    const alice = await createUser({
      orgs: [{ org, role: OrgRole.ORG_ADMIN }],
    });
    const dave = await createUser({
      orgs: [{ org, role: OrgRole.REVIEWER }],
    });
    const eve = await createUser({
      orgs: [{ org, role: OrgRole.REVIEWER }],
    });

    const aliceClient = await loginAgent(alice.email);
    const daveClient = await loginAgent(dave.email);
    const eveClient = await loginAgent(eve.email);

    const created = await aliceClient
      .post("/prs")
      .set("Content-Type", "application/json")
      .send({
        title: "Dual approval",
        requiresApprovals: 2,
        reviewerIds: [dave.id, eve.id],
      })
      .expect(201);

    await aliceClient
      .post(`/prs/${created.body.id}/transition`)
      .set("Content-Type", "application/json")
      .send({ to: PrStatus.IN_REVIEW })
      .expect(200);

    await daveClient
      .post(`/prs/${created.body.id}/reviews`)
      .set("Content-Type", "application/json")
      .send({ decision: PrReviewDecision.APPROVE })
      .expect(200);

    const approved = await eveClient
      .post(`/prs/${created.body.id}/reviews`)
      .set("Content-Type", "application/json")
      .send({ decision: PrReviewDecision.APPROVE })
      .expect(200);

    expect(approved.body.status).toBe(PrStatus.APPROVED);
  });

  it("does not count duplicate approvals from the same reviewer", async () => {
    const org = await createOrg("Acme");
    const alice = await createUser({
      orgs: [{ org, role: OrgRole.ORG_ADMIN }],
    });
    const dave = await createUser({
      orgs: [{ org, role: OrgRole.REVIEWER }],
    });

    const aliceClient = await loginAgent(alice.email);
    const daveClient = await loginAgent(dave.email);

    const created = await aliceClient
      .post("/prs")
      .set("Content-Type", "application/json")
      .send({
        title: "Duplicate reviewer probe",
        requiresApprovals: 2,
        reviewerIds: [dave.id],
      })
      .expect(201);

    await aliceClient
      .post(`/prs/${created.body.id}/transition`)
      .set("Content-Type", "application/json")
      .send({ to: PrStatus.IN_REVIEW })
      .expect(200);

    await daveClient
      .post(`/prs/${created.body.id}/reviews`)
      .set("Content-Type", "application/json")
      .send({ decision: PrReviewDecision.APPROVE })
      .expect(200);

    const afterDuplicate = await daveClient
      .post(`/prs/${created.body.id}/reviews`)
      .set("Content-Type", "application/json")
      .send({ decision: PrReviewDecision.APPROVE })
      .expect(200);

    expect(afterDuplicate.body.status).toBe(PrStatus.IN_REVIEW);
  });

  it("rejects reviews when pull request is not IN_REVIEW", async () => {
    const org = await createOrg("Acme");
    const alice = await createUser({
      orgs: [{ org, role: OrgRole.ORG_ADMIN }],
    });
    const dave = await createUser({
      orgs: [{ org, role: OrgRole.REVIEWER }],
    });

    const aliceClient = await loginAgent(alice.email);
    const daveClient = await loginAgent(dave.email);

    const created = await aliceClient
      .post("/prs")
      .set("Content-Type", "application/json")
      .send({
        title: "Approved then locked",
        requiresApprovals: 1,
        reviewerIds: [dave.id],
      })
      .expect(201);

    await aliceClient
      .post(`/prs/${created.body.id}/transition`)
      .set("Content-Type", "application/json")
      .send({ to: PrStatus.IN_REVIEW })
      .expect(200);

    await daveClient
      .post(`/prs/${created.body.id}/reviews`)
      .set("Content-Type", "application/json")
      .send({ decision: PrReviewDecision.APPROVE })
      .expect(200);

    await daveClient
      .post(`/prs/${created.body.id}/reviews`)
      .set("Content-Type", "application/json")
      .send({ decision: PrReviewDecision.REQUEST_CHANGES })
      .expect(409);
  });

  it("bumps version on content edit and requires fresh approvals", async () => {
    const org = await createOrg("Acme");
    const alice = await createUser({
      orgs: [{ org, role: OrgRole.ORG_ADMIN }],
    });
    const dave = await createUser({
      orgs: [{ org, role: OrgRole.REVIEWER }],
    });

    const aliceClient = await loginAgent(alice.email);
    const daveClient = await loginAgent(dave.email);

    const created = await aliceClient
      .post("/prs")
      .set("Content-Type", "application/json")
      .send({
        title: "Version bump probe",
        description: "v1 body",
        requiresApprovals: 1,
        reviewerIds: [dave.id],
      })
      .expect(201);

    await aliceClient
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
    expect(approved.body.currentVersion).toBe(1);

    const edited = await aliceClient
      .patch(`/prs/${created.body.id}`)
      .set("Content-Type", "application/json")
      .send({ title: "Version bump probe v2", description: "v2 body" })
      .expect(200);

    expect(edited.body.currentVersion).toBe(2);
    expect(edited.body.status).toBe(PrStatus.IN_REVIEW);

    const detail = await aliceClient.get(`/prs/${created.body.id}`).expect(200);
    expect(detail.body.status).toBe(PrStatus.IN_REVIEW);
    expect(detail.body.currentVersion).toBe(2);
  });
});
