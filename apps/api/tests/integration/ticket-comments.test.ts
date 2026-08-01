import { AuditAction, OrgRole } from "@unified/types";
import { afterAll, describe, expect, it } from "vitest";
import { ownerDb } from "../support/db.js";
import { cleanupRunFixtures, createOrg, createTicket, createUser } from "../support/fixtures.js";
import { loginAgent, waitForAudit } from "../support/http.js";

describe("ticket comments", () => {
  afterAll(async () => {
    await cleanupRunFixtures();
  });

  it("returns 404 for cross-org ticket comment access (BOLA)", async () => {
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
      title: "Foreign ticket",
      createdById: bob.id,
    });

    const client = await loginAgent(alice.email);

    await client
      .get(`/tickets/${foreignTicket.id}/comments`)
      .expect(404)
      .expect((res) => {
        expect(res.body.error).toBe("Ticket not found");
      });

    await client
      .post(`/tickets/${foreignTicket.id}/comments`)
      .set("Content-Type", "application/json")
      .send({ body: "Hijack" })
      .expect(404)
      .expect((res) => {
        expect(res.body.error).toBe("Ticket not found");
      });
  });

  it("returns 404 when creating a comment under a foreign ticketId", async () => {
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
      title: "Foreign create-comment ticket",
      createdById: bob.id,
    });

    const client = await loginAgent(alice.email);
    await client
      .post(`/tickets/${foreignTicket.id}/comments`)
      .set("Content-Type", "application/json")
      .send({ body: "Should not land" })
      .expect(404)
      .expect((res) => {
        expect(res.body.error).toBe("Ticket not found");
        expect(res.body.code).toBeUndefined();
      });
  });

  it("returns 404 when listing comments under a foreign ticket", async () => {
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
      title: "Foreign list-comment ticket",
      createdById: bob.id,
    });

    await ownerDb.ticketComment.create({
      data: {
        ticketId: foreignTicket.id,
        orgId: orgB.id,
        authorId: bob.id,
        body: "Secret comment",
      },
    });

    const client = await loginAgent(alice.email);
    await client
      .get(`/tickets/${foreignTicket.id}/comments`)
      .expect(404)
      .expect((res) => {
        expect(res.body.error).toBe("Ticket not found");
        expect(JSON.stringify(res.body)).not.toContain("Secret comment");
      });
  });

  it("returns 404 for child-ID BOLA on foreign comment", async () => {
    const orgA = await createOrg("Org A");
    const orgB = await createOrg("Org B");
    const alice = await createUser({
      orgs: [{ org: orgA, role: OrgRole.ORG_ADMIN }],
    });
    const bob = await createUser({
      orgs: [{ org: orgB, role: OrgRole.ORG_ADMIN }],
    });

    const ticketA = await createTicket({
      orgId: orgA.id,
      title: "Org A ticket",
      createdById: alice.id,
    });
    const ticketB = await createTicket({
      orgId: orgB.id,
      title: "Org B ticket",
      createdById: bob.id,
    });
    const foreignComment = await ownerDb.ticketComment.create({
      data: {
        ticketId: ticketB.id,
        orgId: orgB.id,
        authorId: bob.id,
        body: "Secret",
      },
    });

    const client = await loginAgent(alice.email);

    await client
      .patch(`/tickets/${ticketA.id}/comments/${foreignComment.id}`)
      .set("Content-Type", "application/json")
      .send({ body: "Nope" })
      .expect(404)
      .expect((res) => {
        expect(res.body.error).toBe("Comment not found");
      });

    await client
      .delete(`/tickets/${ticketA.id}/comments/${foreignComment.id}`)
      .expect(404)
      .expect((res) => {
        expect(res.body.error).toBe("Comment not found");
      });
  });

  it("allows guests to comment on assigned tickets but not mutate comments", async () => {
    const org = await createOrg();
    const admin = await createUser({
      orgs: [{ org, role: OrgRole.ORG_ADMIN }],
    });
    const guest = await createUser({
      orgs: [{ org, role: OrgRole.CROSS_ORG_GUEST }],
    });

    const ticket = await createTicket({
      orgId: org.id,
      title: "Guest comment ticket",
      createdById: admin.id,
      assigneeId: guest.id,
    });
    const unassigned = await createTicket({
      orgId: org.id,
      title: "Guest unassigned comment ticket",
      createdById: admin.id,
      assigneeId: null,
    });

    const guestClient = await loginAgent(guest.email);
    const created = await guestClient
      .post(`/tickets/${ticket.id}/comments`)
      .set("Content-Type", "application/json")
      .send({ body: "Guest note" })
      .expect(201);

    expect(created.body.orgId).toBe(org.id);

    await guestClient
      .post(`/tickets/${unassigned.id}/comments`)
      .set("Content-Type", "application/json")
      .send({ body: "Should 404" })
      .expect(404);

    await guestClient
      .patch(`/tickets/${ticket.id}/comments/${created.body.id}`)
      .set("Content-Type", "application/json")
      .send({ body: "Edited" })
      .expect(403)
      .expect((res) => {
        expect(res.body.code).toBe("insufficient_role");
      });

    await guestClient
      .delete(`/tickets/${ticket.id}/comments/${created.body.id}`)
      .expect(403)
      .expect((res) => {
        expect(res.body.code).toBe("insufficient_role");
      });
  });
  it("allows author edit and blocks non-author mutator edit", async () => {
    const org = await createOrg();
    const agentA = await createUser({
      orgs: [{ org, role: OrgRole.SUPPORT_AGENT }],
    });
    const agentB = await createUser({
      orgs: [{ org, role: OrgRole.SUPPORT_AGENT }],
    });

    const ticket = await createTicket({
      orgId: org.id,
      title: "Author edit ticket",
      createdById: agentA.id,
    });

    const clientA = await loginAgent(agentA.email);
    const created = await clientA
      .post(`/tickets/${ticket.id}/comments`)
      .set("Content-Type", "application/json")
      .send({ body: "Mine" })
      .expect(201);

    await clientA
      .patch(`/tickets/${ticket.id}/comments/${created.body.id}`)
      .set("Content-Type", "application/json")
      .send({ body: "Mine edited" })
      .expect(200)
      .expect((res) => {
        expect(res.body.body).toBe("Mine edited");
      });

    const clientB = await loginAgent(agentB.email);
    await clientB
      .patch(`/tickets/${ticket.id}/comments/${created.body.id}`)
      .set("Content-Type", "application/json")
      .send({ body: "Hijack" })
      .expect(403)
      .expect((res) => {
        expect(res.body.code).toBe("not_comment_author");
      });
  });

  it("allows org admin to delete another user's comment", async () => {
    const org = await createOrg();
    const admin = await createUser({
      orgs: [{ org, role: OrgRole.ORG_ADMIN }],
    });
    const agent = await createUser({
      orgs: [{ org, role: OrgRole.SUPPORT_AGENT }],
    });

    const ticket = await createTicket({
      orgId: org.id,
      title: "Admin delete comment",
      createdById: admin.id,
    });

    const agentClient = await loginAgent(agent.email);
    const created = await agentClient
      .post(`/tickets/${ticket.id}/comments`)
      .set("Content-Type", "application/json")
      .send({ body: "Agent comment" })
      .expect(201);

    const adminClient = await loginAgent(admin.email);
    await adminClient.delete(`/tickets/${ticket.id}/comments/${created.body.id}`).expect(204);
  });

  it("blocks POST when comments disabled but allows list and DELETE", async () => {
    const org = await createOrg();
    const admin = await createUser({
      orgs: [{ org, role: OrgRole.ORG_ADMIN }],
    });

    await ownerDb.organization.update({
      where: { id: org.id },
      data: {
        settings: {
          featureFlags: { commentsEnabled: false, attachmentsEnabled: true },
        },
      },
    });

    const ticket = await createTicket({
      orgId: org.id,
      title: "Flagged comments ticket",
      createdById: admin.id,
    });

    const comment = await ownerDb.ticketComment.create({
      data: {
        ticketId: ticket.id,
        orgId: org.id,
        authorId: admin.id,
        body: "Pre-existing",
      },
    });

    const client = await loginAgent(admin.email);

    await client.get(`/tickets/${ticket.id}/comments`).expect(200);

    await client
      .post(`/tickets/${ticket.id}/comments`)
      .set("Content-Type", "application/json")
      .send({ body: "Blocked" })
      .expect(403)
      .expect((res) => {
        expect(res.body.code).toBe("feature_disabled");
      });

    await client.delete(`/tickets/${ticket.id}/comments/${comment.id}`).expect(204);
  });

  it("writes comment.create audit row", async () => {
    const org = await createOrg();
    const admin = await createUser({
      orgs: [{ org, role: OrgRole.ORG_ADMIN }],
    });

    const ticket = await createTicket({
      orgId: org.id,
      title: "Audit comment ticket",
      createdById: admin.id,
    });

    const client = await loginAgent(admin.email);
    const auditSince = new Date();
    const created = await client
      .post(`/tickets/${ticket.id}/comments`)
      .set("Content-Type", "application/json")
      .send({ body: "Audited" })
      .expect(201);

    await waitForAudit(
      (row) =>
        row.action === AuditAction.COMMENT_CREATE &&
        row.userId === admin.id &&
        row.orgId === org.id &&
        row.entityType === "TicketComment" &&
        row.entityId === created.body.id,
      auditSince,
    );
  });
});
