import {
  AuditAction,
  OrgRole,
  TicketStatus,
} from "@unified/types";
import { afterAll, describe, expect, it } from "vitest";
import { ownerDb } from "../../support/db.js";
import {
  cleanupRunFixtures,
  createOrg,
  createTicket,
  createUser,
} from "../../support/fixtures.js";
import { loginAgent } from "../../support/http.js";
import {
  assertNoSuccessAuditForEntity,
  assertOwnerAliveAttackerDenyOwnerUnchanged,
  snapshotTicket,
} from "../../support/product-bola-helpers.js";

describe("product BOLA mutation postconditions (tickets)", () => {
  afterAll(async () => {
    await cleanupRunFixtures();
  });

  it("ticket.get.foreign.admin: foreign ORG_ADMIN GET returns 404", async () => {
    const orgA = await createOrg("Org A");
    const orgB = await createOrg("Org B");
    const alice = await createUser({
      orgs: [{ org: orgA, role: OrgRole.ORG_ADMIN }],
    });
    const bob = await createUser({
      orgs: [{ org: orgB, role: OrgRole.ORG_ADMIN }],
    });

    const foreignTicket = await createTicket({
      orgId: orgB.id,
      title: "Foreign GET ticket",
      createdById: bob.id,
    });

    const attacker = await loginAgent(alice.email);

    await attacker
      .get(`/tickets/${foreignTicket.id}`)
      .expect(404)
      .expect((res) => {
        expect(res.body.error).toBe("Ticket not found");
        expect(JSON.stringify(res.body)).not.toContain("Foreign GET ticket");
        expect(JSON.stringify(res.body)).not.toContain(orgB.id);
      });
  });

  it("ticket.patch.foreign.admin: foreign ORG_ADMIN PATCH returns 404 and ownerDb unchanged", async () => {
    const orgA = await createOrg("Org A");
    const orgB = await createOrg("Org B");
    const alice = await createUser({
      orgs: [{ org: orgA, role: OrgRole.ORG_ADMIN }],
    });
    const bob = await createUser({
      orgs: [{ org: orgB, role: OrgRole.ORG_ADMIN }],
    });

    const foreignTicket = await createTicket({
      orgId: orgB.id,
      title: "Foreign PATCH ticket",
      createdById: bob.id,
    });

    const owner = await loginAgent(bob.email);
    const attacker = await loginAgent(alice.email);

    await assertOwnerAliveAttackerDenyOwnerUnchanged({
      ownerAgent: owner,
      ownerGetPath: `/tickets/${foreignTicket.id}`,
      attack: () =>
        attacker
          .patch(`/tickets/${foreignTicket.id}`)
          .set("Content-Type", "application/json")
          .send({ title: "Hijacked title" }),
      snapshot: () => snapshotTicket(foreignTicket.id),
      expectEqual: (before, after) => expect(after).toEqual(before),
      expectAttackStatus: 404,
      forbiddenBodySubstrings: ["Foreign PATCH ticket"],
    });
  });

  it("ticket.status.foreign.admin: foreign ORG_ADMIN status PATCH returns 404 and ownerDb unchanged", async () => {
    const orgA = await createOrg("Org A");
    const orgB = await createOrg("Org B");
    const alice = await createUser({
      orgs: [{ org: orgA, role: OrgRole.ORG_ADMIN }],
    });
    const bob = await createUser({
      orgs: [{ org: orgB, role: OrgRole.ORG_ADMIN }],
    });

    const foreignTicket = await createTicket({
      orgId: orgB.id,
      title: "Foreign status ticket",
      createdById: bob.id,
      status: TicketStatus.OPEN,
    });

    const owner = await loginAgent(bob.email);
    const attacker = await loginAgent(alice.email);

    await assertOwnerAliveAttackerDenyOwnerUnchanged({
      ownerAgent: owner,
      ownerGetPath: `/tickets/${foreignTicket.id}`,
      attack: () =>
        attacker
          .patch(`/tickets/${foreignTicket.id}/status`)
          .set("Content-Type", "application/json")
          .send({ status: TicketStatus.IN_PROGRESS }),
      snapshot: () => snapshotTicket(foreignTicket.id),
      expectEqual: (before, after) => expect(after).toEqual(before),
      expectAttackStatus: 404,
      forbiddenBodySubstrings: ["Foreign status ticket"],
    });
  });

  it("ticket.delete.foreign.admin: foreign ORG_ADMIN DELETE returns 404 and row remains", async () => {
    const orgA = await createOrg("Org A");
    const orgB = await createOrg("Org B");
    const alice = await createUser({
      orgs: [{ org: orgA, role: OrgRole.ORG_ADMIN }],
    });
    const bob = await createUser({
      orgs: [{ org: orgB, role: OrgRole.ORG_ADMIN }],
    });

    const foreignTicket = await createTicket({
      orgId: orgB.id,
      title: "Foreign DELETE ticket",
      createdById: bob.id,
    });

    const owner = await loginAgent(bob.email);
    const attacker = await loginAgent(alice.email);

    await assertOwnerAliveAttackerDenyOwnerUnchanged({
      ownerAgent: owner,
      ownerGetPath: `/tickets/${foreignTicket.id}`,
      attack: () => attacker.delete(`/tickets/${foreignTicket.id}`),
      snapshot: () => snapshotTicket(foreignTicket.id),
      expectEqual: (before, after) => expect(after).toEqual(before),
      expectAttackStatus: 404,
      forbiddenBodySubstrings: ["Foreign DELETE ticket"],
    });

    const row = await ownerDb.ticket.findUnique({
      where: { id: foreignTicket.id },
    });
    expect(row).not.toBeNull();
  });

  it("ticket.create.bodyOrgId.ignored: forged body orgId ignored; DB uses session org", async () => {
    const orgA = await createOrg("Org A");
    const orgB = await createOrg("Org B");
    const dave = await createUser({
      orgs: [
        { org: orgA, role: OrgRole.ORG_ADMIN },
        { org: orgB, role: OrgRole.ORG_ADMIN },
      ],
    });

    const client = await loginAgent(dave.email);
    const createRes = await client
      .post("/tickets")
      .set("Content-Type", "application/json")
      .send({ title: "Forged org ticket", orgId: orgB.id })
      .expect(201);

    expect(createRes.body.orgId).toBe(orgA.id);

    const row = await ownerDb.ticket.findUniqueOrThrow({
      where: { id: createRes.body.id },
    });
    expect(row.orgId).toBe(orgA.id);
  });

  it("ticket.mutate.foreign.admin.noAudit: foreign PATCH 404 leaves no success audit", async () => {
    const orgA = await createOrg("Org A");
    const orgB = await createOrg("Org B");
    const alice = await createUser({
      orgs: [{ org: orgA, role: OrgRole.ORG_ADMIN }],
    });
    const bob = await createUser({
      orgs: [{ org: orgB, role: OrgRole.ORG_ADMIN }],
    });

    const foreignTicket = await createTicket({
      orgId: orgB.id,
      title: "Foreign no-audit ticket",
      createdById: bob.id,
    });

    const owner = await loginAgent(bob.email);
    const attacker = await loginAgent(alice.email);
    const since = new Date();

    await assertOwnerAliveAttackerDenyOwnerUnchanged({
      ownerAgent: owner,
      ownerGetPath: `/tickets/${foreignTicket.id}`,
      attack: () =>
        attacker
          .patch(`/tickets/${foreignTicket.id}`)
          .set("Content-Type", "application/json")
          .send({ title: "Audit probe hijack" }),
      snapshot: () => snapshotTicket(foreignTicket.id),
      expectEqual: (before, after) => expect(after).toEqual(before),
      expectAttackStatus: 404,
      forbiddenBodySubstrings: ["Foreign no-audit ticket"],
    });

    await assertNoSuccessAuditForEntity({
      entityType: "Ticket",
      entityId: foreignTicket.id,
      forbiddenActions: [
        AuditAction.TICKET_UPDATE,
        AuditAction.TICKET_DELETE,
      ],
      since,
    });
  });
});
