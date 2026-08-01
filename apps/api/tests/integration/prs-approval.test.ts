import { OrgRole, PrReviewDecision, PrStatus } from "@unified/types";
import { afterAll, describe, expect, it } from "vitest";
import { ownerDb } from "../support/db.js";
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
    const eve = await createUser({
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

    const afterDuplicate = await daveClient
      .post(`/prs/${created.body.id}/reviews`)
      .set("Content-Type", "application/json")
      .send({ decision: PrReviewDecision.APPROVE })
      .expect(200);

    expect(afterDuplicate.body.status).toBe(PrStatus.IN_REVIEW);
  });

  it("rejects requiresApprovals above selected reviewer count", async () => {
    const org = await createOrg("Acme");
    const alice = await createUser({
      orgs: [{ org, role: OrgRole.ORG_ADMIN }],
    });
    const dave = await createUser({
      orgs: [{ org, role: OrgRole.REVIEWER }],
    });

    const aliceClient = await loginAgent(alice.email);

    const created = await aliceClient
      .post("/prs")
      .set("Content-Type", "application/json")
      .send({
        title: "Over-capped approvals",
        requiresApprovals: 2,
        reviewerIds: [dave.id],
      })
      .expect(400);

    expect(created.body.code).toBe("requires_approvals_exceeds_reviewers");

    const ok = await aliceClient
      .post("/prs")
      .set("Content-Type", "application/json")
      .send({
        title: "Draft without reviewers",
        requiresApprovals: 1,
      })
      .expect(201);

    const overPatch = await aliceClient
      .patch(`/prs/${ok.body.id}`)
      .set("Content-Type", "application/json")
      .send({
        requiresApprovals: 2,
        reviewerIds: [dave.id],
      })
      .expect(400);

    expect(overPatch.body.code).toBe("requires_approvals_exceeds_reviewers");

    await aliceClient
      .patch(`/prs/${ok.body.id}`)
      .set("Content-Type", "application/json")
      .send({ title: "Draft without reviewers (title only)" })
      .expect(200);
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

  it("rejects invalid direct transitions and keeps the draft unchanged", async () => {
    const org = await createOrg("Acme");
    const alice = await createUser({
      orgs: [{ org, role: OrgRole.ORG_ADMIN }],
    });
    const aliceClient = await loginAgent(alice.email);
    const created = await aliceClient
      .post("/prs")
      .set("Content-Type", "application/json")
      .send({ title: "Transition guard" })
      .expect(201);

    for (const to of [PrStatus.DRAFT, PrStatus.APPROVED, PrStatus.REJECTED, PrStatus.MERGED]) {
      const denied = await aliceClient
        .post(`/prs/${created.body.id}/transition`)
        .set("Content-Type", "application/json")
        .send({ to })
        .expect(400);
      expect(denied.body.code).toBe("invalid_transition");
    }

    const unchanged = await ownerDb.pullRequest.findUniqueOrThrow({
      where: { id: created.body.id },
    });
    expect(unchanged.status).toBe(PrStatus.DRAFT);
  });

  it("rejects an unassigned reviewer without creating a review", async () => {
    const org = await createOrg("Acme");
    const alice = await createUser({
      orgs: [{ org, role: OrgRole.ORG_ADMIN }],
    });
    const assigned = await createUser({
      orgs: [{ org, role: OrgRole.REVIEWER }],
    });
    const unassigned = await createUser({
      orgs: [{ org, role: OrgRole.REVIEWER }],
    });
    const aliceClient = await loginAgent(alice.email);
    const unassignedClient = await loginAgent(unassigned.email);
    const created = await aliceClient
      .post("/prs")
      .set("Content-Type", "application/json")
      .send({
        title: "Assigned reviewers only",
        reviewerIds: [assigned.id],
        requiresApprovals: 1,
      })
      .expect(201);
    await aliceClient
      .post(`/prs/${created.body.id}/transition`)
      .set("Content-Type", "application/json")
      .send({ to: PrStatus.IN_REVIEW })
      .expect(200);

    await unassignedClient
      .post(`/prs/${created.body.id}/reviews`)
      .set("Content-Type", "application/json")
      .send({ decision: PrReviewDecision.APPROVE })
      .expect(403);

    expect(
      await ownerDb.prReview.count({
        where: { pullRequestId: created.body.id, reviewerId: unassigned.id },
      }),
    ).toBe(0);
  });

  it("keeps IN_REVIEW after request changes", async () => {
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
      .send({ title: "Changes requested", reviewerIds: [dave.id] })
      .expect(201);
    await aliceClient
      .post(`/prs/${created.body.id}/transition`)
      .set("Content-Type", "application/json")
      .send({ to: PrStatus.IN_REVIEW })
      .expect(200);

    const reviewed = await daveClient
      .post(`/prs/${created.body.id}/reviews`)
      .set("Content-Type", "application/json")
      .send({ decision: PrReviewDecision.REQUEST_CHANGES })
      .expect(200);

    expect(reviewed.body.status).toBe(PrStatus.IN_REVIEW);
  });

  it("supports APPROVED to REJECTED and REJECTED back to IN_REVIEW", async () => {
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
      .send({ title: "Reopen workflow", reviewerIds: [dave.id] })
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

    const rejected = await aliceClient
      .post(`/prs/${created.body.id}/transition`)
      .set("Content-Type", "application/json")
      .send({ to: PrStatus.REJECTED })
      .expect(200);
    expect(rejected.body.status).toBe(PrStatus.REJECTED);

    const reopened = await aliceClient
      .post(`/prs/${created.body.id}/transition`)
      .set("Content-Type", "application/json")
      .send({ to: PrStatus.IN_REVIEW })
      .expect(200);
    expect(reopened.body.status).toBe(PrStatus.IN_REVIEW);
  });

  it("keeps merged pull requests terminal for edits, transitions, and reviews", async () => {
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
        title: "Terminal PR",
        reviewerIds: [dave.id],
        requiresApprovals: 1,
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
    await aliceClient
      .post(`/prs/${created.body.id}/transition`)
      .set("Content-Type", "application/json")
      .send({ to: PrStatus.MERGED })
      .expect(200);

    await aliceClient
      .patch(`/prs/${created.body.id}`)
      .set("Content-Type", "application/json")
      .send({ title: "Forbidden edit" })
      .expect(400);
    await aliceClient
      .post(`/prs/${created.body.id}/transition`)
      .set("Content-Type", "application/json")
      .send({ to: PrStatus.REJECTED })
      .expect(400);
    await daveClient
      .post(`/prs/${created.body.id}/reviews`)
      .set("Content-Type", "application/json")
      .send({ decision: PrReviewDecision.REQUEST_CHANGES })
      .expect(409);

    const merged = await ownerDb.pullRequest.findUniqueOrThrow({
      where: { id: created.body.id },
    });
    expect(merged.status).toBe(PrStatus.MERGED);
    expect(merged.title).toBe("Terminal PR");
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
