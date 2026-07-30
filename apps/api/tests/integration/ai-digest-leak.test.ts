import { afterAll, describe, expect, it } from "vitest";
import {
  assertFactsWithinAllowlist,
  collectDigestFacts,
} from "../../src/digest/collect-facts.js";
import { redactNotificationsForResource } from "../../src/digest/redact.js";
import type { DigestFacts } from "../../src/digest/types.js";
import { ownerDb } from "../support/db.js";
import {
  cleanupRunFixtures,
  createDigestRun,
  createOrg,
  createTicket,
  createUser,
} from "../support/fixtures.js";
import {
  createConnectedShareWorld,
  createSharedPr,
  createSharedTicket,
} from "../support/share-fixtures.js";
import { loginAgent } from "../support/http.js";

function titlesOf(facts: DigestFacts): string[] {
  return facts.items.map((i) => i.title);
}

function idsOf(facts: DigestFacts, kind: "ticket" | "pull_request"): string[] {
  return facts.items.filter((i) => i.kind === kind).map((i) => i.id);
}

describe("AI digest cross-org leak", () => {
  afterAll(async () => {
    await cleanupRunFixtures();
  });

  it("Alice never sees Globex/orgC secrets; Eve sees only shared ticket", async () => {
    const world = await createConnectedShareWorld({
      orgAName: "Acme Leak A",
      orgBName: "Globex Leak B",
    });
    const orgC = await createOrg("Leak Org C");

    const acmeSecret = await createTicket({
      orgId: world.orgA.id,
      createdById: world.alice.id,
      title: "Acme secret billing vault",
      assigneeId: world.alice.id,
    });
    const globexSecret = await createTicket({
      orgId: world.orgB.id,
      createdById: world.carol.id,
      title: "Globex billing API cleanup",
      assigneeId: world.carol.id,
    });
    const orgCSecret = await createTicket({
      orgId: orgC.id,
      createdById: (
        await createUser({
          name: "OrgC Admin",
          orgs: [{ org: orgC, role: "ORG_ADMIN" }],
        })
      ).id,
      title: "OrgC classified ticket",
    });

    const shared = await createSharedTicket({
      ownerOrg: world.orgA,
      granteeOrg: world.orgB,
      createdById: world.alice.id,
      grantedToUserId: world.eve.id,
      grantedByUserId: world.alice.id,
      orgConnectionId: world.connection.id,
      title: "Billing discrepancy",
    });

    const aliceFacts = await collectDigestFacts(world.alice.id);
    assertFactsWithinAllowlist(aliceFacts);
    expect(titlesOf(aliceFacts)).not.toContain("Globex billing API cleanup");
    expect(titlesOf(aliceFacts)).not.toContain("OrgC classified ticket");
    expect(idsOf(aliceFacts, "ticket")).not.toContain(globexSecret.id);
    expect(idsOf(aliceFacts, "ticket")).not.toContain(orgCSecret.id);
    expect(aliceFacts.allowedOrgIds).not.toContain(world.orgB.id);
    expect(aliceFacts.allowedOrgIds).not.toContain(orgC.id);
    // Alice assigned Acme secret may appear
    expect(idsOf(aliceFacts, "ticket")).toContain(acmeSecret.id);

    const eveFacts = await collectDigestFacts(world.eve.id);
    assertFactsWithinAllowlist(eveFacts);
    expect(idsOf(eveFacts, "ticket")).toContain(shared.ticketId);
    expect(titlesOf(eveFacts)).toContain("Billing discrepancy");
    expect(idsOf(eveFacts, "ticket")).not.toContain(shared.unsharedSiblingId);
    expect(titlesOf(eveFacts)).not.toContain("Unshared sibling ticket");
    expect(titlesOf(eveFacts)).not.toContain("Acme secret billing vault");
    expect(eveFacts.items.every((i) => i.kind !== "pull_request" || i.signal === "shared")).toBe(
      true,
    );
    // SUPPORT_AGENT: no member-lane PR waiting_review
    expect(eveFacts.items.some((i) => i.signal === "waiting_review")).toBe(false);
  });

  it("Frank guest: assignee-only; no unassigned Acme siblings; no PRs", async () => {
    const world = await createConnectedShareWorld();
    const frankTicket = await createTicket({
      orgId: world.orgA.id,
      createdById: world.alice.id,
      title: "Frank assignee ticket",
      assigneeId: world.frank.id,
    });
    const other = await createTicket({
      orgId: world.orgA.id,
      createdById: world.alice.id,
      title: "Unassigned Acme ticket",
      assigneeId: null,
    });
    await createSharedTicket({
      ownerOrg: world.orgB,
      granteeOrg: world.orgA,
      createdById: world.carol.id,
      grantedToUserId: world.alice.id,
      grantedByUserId: world.carol.id,
      orgConnectionId: world.connection.id,
      title: "Shared to Alice not Frank",
    });

    const facts = await collectDigestFacts(world.frank.id);
    assertFactsWithinAllowlist(facts);
    expect(idsOf(facts, "ticket")).toEqual([frankTicket.id]);
    expect(idsOf(facts, "ticket")).not.toContain(other.id);
    expect(facts.items.some((i) => i.kind === "pull_request")).toBe(false);
    expect(titlesOf(facts)).not.toContain("Shared to Alice not Frank");
  });

  it("Dave multi-org: member lanes + shared PR once; no orgC; dedupe reviewer+share", async () => {
    const world = await createConnectedShareWorld();
    const orgC = await createOrg("Dave Leak Org C");
    await createTicket({
      orgId: orgC.id,
      createdById: (
        await createUser({
          name: "C Admin",
          orgs: [{ org: orgC, role: "ORG_ADMIN" }],
        })
      ).id,
      title: "OrgC secret for Dave leak",
    });

    const shared = await createSharedPr({
      ownerOrg: world.orgB,
      granteeOrg: world.orgA,
      createdById: world.carol.id,
      grantedToUserId: world.dave.id,
      grantedByUserId: world.carol.id,
      orgConnectionId: world.connection.id,
      title: "Globex data retention policy",
    });

    // Also make Dave a reviewer on the same PR (dedupe)
    await ownerDb.pullRequest.update({
      where: { id: shared.prId },
      data: { status: "IN_REVIEW" },
    });
    await ownerDb.prReviewer.create({
      data: { pullRequestId: shared.prId, userId: world.dave.id },
    });

    const acmeAssigned = await createTicket({
      orgId: world.orgA.id,
      createdById: world.alice.id,
      title: "Dave Acme assigned",
      assigneeId: world.dave.id,
    });

    const facts = await collectDigestFacts(world.dave.id);
    assertFactsWithinAllowlist(facts);
    expect(idsOf(facts, "ticket")).toContain(acmeAssigned.id);
    expect(idsOf(facts, "pull_request")).toContain(shared.prId);
    expect(idsOf(facts, "pull_request").filter((id) => id === shared.prId)).toHaveLength(1);
    expect(idsOf(facts, "pull_request")).not.toContain(shared.unsharedSiblingId);
    expect(titlesOf(facts)).not.toContain("OrgC secret for Dave leak");
    expect(facts.allowedOrgIds).not.toContain(orgC.id);
  });

  it("revoke grant: re-collect excludes item; prior notification redacted", async () => {
    const world = await createConnectedShareWorld();
    const shared = await createSharedTicket({
      ownerOrg: world.orgA,
      granteeOrg: world.orgB,
      createdById: world.alice.id,
      grantedToUserId: world.eve.id,
      grantedByUserId: world.alice.id,
      orgConnectionId: world.connection.id,
      title: "Revoke leak ticket",
    });

    const before = await collectDigestFacts(world.eve.id);
    expect(idsOf(before, "ticket")).toContain(shared.ticketId);

    const run = await createDigestRun({ status: "SUCCEEDED" });
    await ownerDb.notification.create({
      data: {
        userId: world.eve.id,
        digestRunId: run.id,
        title: "Digest with shared",
        body: `Includes ${shared.ticketId} Revoke leak ticket`,
        facts: { items: [{ id: shared.ticketId, title: "Revoke leak ticket" }] },
        resourceIds: [`ticket:${shared.ticketId}`],
      },
    });

    await ownerDb.shareGrant.update({
      where: { id: shared.shareId },
      data: {
        status: "REVOKED",
        revokedAt: new Date(),
        revokedById: world.alice.id,
        revokeReason: "test",
      },
    });
    await redactNotificationsForResource({
      userId: world.eve.id,
      resourceType: "TICKET",
      resourceId: shared.ticketId,
    });

    const after = await collectDigestFacts(world.eve.id);
    expect(idsOf(after, "ticket")).not.toContain(shared.ticketId);

    const eve = await loginAgent(world.eve.email);
    const list = await eve.get("/notifications").expect(200);
    const body = JSON.stringify(list.body);
    expect(body).not.toContain("Revoke leak ticket");
    expect(body).not.toContain(shared.ticketId);
    expect(list.body.items.every((i: { title: string }) => i.title !== "Digest with shared")).toBe(
      true,
    );
  });

  it("assertFactsWithinAllowlist throws on poisoned orgId", () => {
    const poisoned: DigestFacts = {
      userId: "u1",
      collectedAt: new Date().toISOString(),
      allowedOrgIds: ["org-a"],
      assignedTicketCount: 1,
      staleAssignedTicketCount: 0,
      waitingPrCount: 0,
      oldestWaitingPrIdleDays: null,
      sharedTicketCount: 0,
      sharedPrCount: 0,
      items: [
        {
          kind: "ticket",
          id: "t1",
          title: "leak",
          orgId: "org-evil",
          orgName: "Evil",
          signal: "assigned",
        },
      ],
    };
    expect(() => assertFactsWithinAllowlist(poisoned)).toThrow(/not in allowlist/);
  });

  it("notification IDOR: Alice cannot mark Eve notification; no userId widen", async () => {
    const world = await createConnectedShareWorld();
    const run = await createDigestRun({ status: "SUCCEEDED" });
    const eveNotif = await ownerDb.notification.create({
      data: {
        userId: world.eve.id,
        digestRunId: run.id,
        title: "Eve only",
        body: "secret eve digest",
        facts: {},
        resourceIds: [],
      },
    });
    const aliceNotif = await ownerDb.notification.create({
      data: {
        userId: world.alice.id,
        digestRunId: run.id,
        title: "Alice digest",
        body: "alice body",
        facts: {},
        resourceIds: [],
      },
    });

    const alice = await loginAgent(world.alice.email);

    await alice.post(`/notifications/${eveNotif.id}/read`).expect(404);

    const list = await alice.get("/notifications").expect(200);
    expect(list.headers["cache-control"]).toMatch(/no-store/i);
    expect(JSON.stringify(list.body)).not.toContain("secret eve digest");
    expect(list.body.items.some((i: { id: string }) => i.id === aliceNotif.id)).toBe(true);
    expect(list.body.items.some((i: { id: string }) => i.id === eveNotif.id)).toBe(false);

    const widened = await alice
      .get("/notifications")
      .query({ userId: world.eve.id })
      .expect(200);
    expect(widened.body.items.every((i: { id: string }) => i.id !== eveNotif.id)).toBe(true);

    const unreadBefore = await (await loginAgent(world.eve.email))
      .get("/notifications/unread-count")
      .expect(200);
    expect(unreadBefore.body.count).toBeGreaterThanOrEqual(1);

    await alice.post("/notifications/read-all").expect(204);

    const unreadAfter = await (await loginAgent(world.eve.email))
      .get("/notifications/unread-count")
      .expect(200);
    expect(unreadAfter.body.count).toBe(unreadBefore.body.count);
  });

  it("platform admin with no memberships: empty facts", async () => {
    const platform = await createUser({
      name: "Platform Digest",
      isPlatformAdmin: true,
      orgs: [],
    });
    const facts = await collectDigestFacts(platform.id);
    expect(facts.items).toEqual([]);
    expect(facts.assignedTicketCount).toBe(0);
  });
});
