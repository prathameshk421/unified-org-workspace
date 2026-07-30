import {
  AuditAction,
  OrgRole,
  TicketStatus,
} from "@unified/types";
import { afterAll, describe, expect, it } from "vitest";
import { ownerDb } from "../support/db.js";
import {
  cleanupRunFixtures,
  createOrg,
  createTicket,
  createUser,
} from "../support/fixtures.js";
import { loginAgent, waitForAudit } from "../support/http.js";

describe("tickets", () => {
  afterAll(async () => {
    await cleanupRunFixtures();
  });

  it("returns 404 for cross-org ticket access (BOLA)", async () => {
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

    await client.get(`/tickets/${foreignTicket.id}`).expect(404).expect((res) => {
      expect(res.body.error).toBe("Ticket not found");
      expect(JSON.stringify(res.body)).not.toContain("Foreign ticket");
      expect(JSON.stringify(res.body)).not.toContain(orgB.id);
    });

    await client
      .patch(`/tickets/${foreignTicket.id}`)
      .set("Content-Type", "application/json")
      .send({ title: "Hijacked" })
      .expect(404)
      .expect((res) => {
        expect(res.body.error).toBe("Ticket not found");
        expect(JSON.stringify(res.body)).not.toContain("Foreign ticket");
      });

    await client
      .delete(`/tickets/${foreignTicket.id}`)
      .expect(404)
      .expect((res) => {
        expect(res.body.error).toBe("Ticket not found");
      });
  });

  it("lists only tickets for the active org", async () => {
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
      title: "Org A list ticket",
      createdById: alice.id,
    });
    const ticketB = await createTicket({
      orgId: orgB.id,
      title: "Org B secret ticket",
      createdById: bob.id,
    });

    const client = await loginAgent(alice.email);
    const res = await client.get("/tickets").expect(200);

    const ids = (res.body.tickets as Array<{ id: string }>).map((t) => t.id);
    expect(ids).toContain(ticketA.id);
    expect(ids).not.toContain(ticketB.id);
    expect(JSON.stringify(res.body)).not.toContain("Org B secret ticket");
  });

  it("returns 404 for cross-org status PATCH (BOLA)", async () => {
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

    const client = await loginAgent(alice.email);
    await client
      .patch(`/tickets/${foreignTicket.id}/status`)
      .set("Content-Type", "application/json")
      .send({ status: TicketStatus.IN_PROGRESS })
      .expect(404)
      .expect((res) => {
        expect(res.body.error).toBe("Ticket not found");
        expect(JSON.stringify(res.body)).not.toContain("Foreign status ticket");
      });
  });

  it("scopes tickets to session org after multi-org switch", async () => {
    const orgA = await createOrg("Org A");
    const orgB = await createOrg("Org B");
    const dave = await createUser({
      orgs: [
        { org: orgA, role: OrgRole.ORG_ADMIN },
        { org: orgB, role: OrgRole.ORG_ADMIN },
      ],
    });

    const ticketA = await createTicket({
      orgId: orgA.id,
      title: "Dave org A ticket",
      createdById: dave.id,
    });
    const ticketB = await createTicket({
      orgId: orgB.id,
      title: "Dave org B ticket",
      createdById: dave.id,
    });

    const client = await loginAgent(dave.email);

    await client
      .post("/auth/switch-org")
      .set("Content-Type", "application/json")
      .send({ orgId: orgB.id })
      .expect(200);

    await client
      .get(`/tickets/${ticketA.id}`)
      .expect(404)
      .expect((res) => {
        expect(res.body.error).toBe("Ticket not found");
        expect(JSON.stringify(res.body)).not.toContain("Dave org A ticket");
      });

    const listRes = await client.get("/tickets").expect(200);
    const ids = (listRes.body.tickets as Array<{ id: string }>).map(
      (t) => t.id,
    );
    expect(ids).toContain(ticketB.id);
    expect(ids).not.toContain(ticketA.id);
  });

  it("allows guests to read but not mutate tickets", async () => {
    const org = await createOrg();
    const admin = await createUser({
      orgs: [{ org, role: OrgRole.ORG_ADMIN }],
    });
    const guest = await createUser({
      orgs: [{ org, role: OrgRole.CROSS_ORG_GUEST }],
    });

    const ticket = await createTicket({
      orgId: org.id,
      title: "Guest readable ticket",
      createdById: admin.id,
    });

    const guestClient = await loginAgent(guest.email);

    await guestClient.get("/tickets").expect(200);
    await guestClient.get(`/tickets/${ticket.id}`).expect(200);

    await guestClient
      .post("/tickets")
      .set("Content-Type", "application/json")
      .send({ title: "Guest create attempt" })
      .expect(403)
      .expect((res) => {
        expect(res.body.code).toBe("insufficient_role");
      });

    await guestClient
      .patch(`/tickets/${ticket.id}`)
      .set("Content-Type", "application/json")
      .send({ title: "Guest update attempt" })
      .expect(403)
      .expect((res) => {
        expect(res.body.code).toBe("insufficient_role");
      });

    await guestClient.delete(`/tickets/${ticket.id}`).expect(403).expect((res) => {
      expect(res.body.code).toBe("insufficient_role");
    });
  });

  it("allows support agents and reviewers to create and change status", async () => {
    const org = await createOrg();
    const agent = await createUser({
      orgs: [{ org, role: OrgRole.SUPPORT_AGENT }],
    });
    const reviewer = await createUser({
      orgs: [{ org, role: OrgRole.REVIEWER }],
    });

    const agentClient = await loginAgent(agent.email);
    const createRes = await agentClient
      .post("/tickets")
      .set("Content-Type", "application/json")
      .send({ title: "Agent ticket", description: "Created by agent" })
      .expect(201);

    expect(createRes.body.status).toBe(TicketStatus.OPEN);

    await agentClient
      .patch(`/tickets/${createRes.body.id}/status`)
      .set("Content-Type", "application/json")
      .send({ status: TicketStatus.IN_PROGRESS })
      .expect(200)
      .expect((res) => {
        expect(res.body.status).toBe(TicketStatus.IN_PROGRESS);
      });

    const reviewerClient = await loginAgent(reviewer.email);
    const reviewerTicket = await reviewerClient
      .post("/tickets")
      .set("Content-Type", "application/json")
      .send({ title: "Reviewer ticket" })
      .expect(201);

    await reviewerClient
      .patch(`/tickets/${reviewerTicket.body.id}/status`)
      .set("Content-Type", "application/json")
      .send({ status: TicketStatus.CLOSED })
      .expect(200)
      .expect((res) => {
        expect(res.body.status).toBe(TicketStatus.CLOSED);
      });
  });

  it("rejects invalid status transitions", async () => {
    const org = await createOrg();
    const admin = await createUser({
      orgs: [{ org, role: OrgRole.ORG_ADMIN }],
    });

    const ticket = await createTicket({
      orgId: org.id,
      title: "Closed ticket",
      status: TicketStatus.CLOSED,
      createdById: admin.id,
    });

    const client = await loginAgent(admin.email);

    await client
      .patch(`/tickets/${ticket.id}/status`)
      .set("Content-Type", "application/json")
      .send({ status: TicketStatus.RESOLVED })
      .expect(400)
      .expect((res) => {
        expect(res.body.code).toBe("invalid_status_transition");
      });
  });

  it("writes ticket.create audit row on create", async () => {
    const org = await createOrg();
    const admin = await createUser({
      orgs: [{ org, role: OrgRole.ORG_ADMIN }],
    });

    const client = await loginAgent(admin.email);
    const createRes = await client
      .post("/tickets")
      .set("Content-Type", "application/json")
      .send({ title: "Audited ticket" })
      .expect(201);

    await waitForAudit(
      (row) =>
        row.action === AuditAction.TICKET_CREATE &&
        row.userId === admin.id &&
        row.orgId === org.id &&
        row.entityType === "Ticket" &&
        row.entityId === createRes.body.id,
    );
  });

  it("stores session org and ignores body orgId on create", async () => {
    const orgA = await createOrg("Org A");
    const orgB = await createOrg("Org B");
    const admin = await createUser({
      orgs: [{ org: orgA, role: OrgRole.ORG_ADMIN }],
    });

    const client = await loginAgent(admin.email);
    const createRes = await client
      .post("/tickets")
      .set("Content-Type", "application/json")
      .send({ title: "Tenancy ticket", orgId: orgB.id })
      .expect(201);

    expect(createRes.body.orgId).toBe(orgA.id);

    const row = await ownerDb.ticket.findUniqueOrThrow({
      where: { id: createRes.body.id },
    });
    expect(row.orgId).toBe(orgA.id);
  });
});
