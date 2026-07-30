import { OrgRole, TicketStatus } from "@unified/types";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ownerDb } from "../support/db.js";
import {
  cleanupRunFixtures,
  createOrg,
  createTicket,
  createUser,
  type FixtureOrg,
  type FixtureUser,
} from "../support/fixtures.js";
import { agent, loginAgent } from "../support/http.js";

type Principal =
  | "anonymous"
  | "org_admin"
  | "support_agent"
  | "reviewer"
  | "cross_org_guest"
  | "platform_admin";

type Operation =
  | "list_tickets"
  | "get_ticket"
  | "create_ticket"
  | "patch_ticket"
  | "patch_status"
  | "delete_ticket"
  | "get_settings"
  | "patch_settings"
  | "create_comment"
  | "patch_comment_guest"
  | "upload_attachment"
  | "download_attachment";

const cases: Array<{
  principal: Principal;
  operation: Operation;
  status: number;
  code?: string;
}> = [
  // GET /tickets
  { principal: "anonymous", operation: "list_tickets", status: 401 },
  { principal: "org_admin", operation: "list_tickets", status: 200 },
  { principal: "support_agent", operation: "list_tickets", status: 200 },
  { principal: "reviewer", operation: "list_tickets", status: 200 },
  { principal: "cross_org_guest", operation: "list_tickets", status: 200 },
  {
    principal: "platform_admin",
    operation: "list_tickets",
    status: 403,
    code: "no_active_org",
  },

  // GET /tickets/:id
  { principal: "anonymous", operation: "get_ticket", status: 401 },
  { principal: "org_admin", operation: "get_ticket", status: 200 },
  { principal: "support_agent", operation: "get_ticket", status: 200 },
  { principal: "reviewer", operation: "get_ticket", status: 200 },
  { principal: "cross_org_guest", operation: "get_ticket", status: 200 },
  {
    principal: "platform_admin",
    operation: "get_ticket",
    status: 403,
    code: "no_active_org",
  },

  // POST /tickets
  { principal: "anonymous", operation: "create_ticket", status: 401 },
  { principal: "org_admin", operation: "create_ticket", status: 201 },
  { principal: "support_agent", operation: "create_ticket", status: 201 },
  { principal: "reviewer", operation: "create_ticket", status: 201 },
  {
    principal: "cross_org_guest",
    operation: "create_ticket",
    status: 403,
    code: "insufficient_role",
  },
  {
    principal: "platform_admin",
    operation: "create_ticket",
    status: 403,
    code: "no_active_org",
  },

  // PATCH /tickets/:id
  { principal: "anonymous", operation: "patch_ticket", status: 401 },
  { principal: "org_admin", operation: "patch_ticket", status: 200 },
  { principal: "support_agent", operation: "patch_ticket", status: 200 },
  { principal: "reviewer", operation: "patch_ticket", status: 200 },
  {
    principal: "cross_org_guest",
    operation: "patch_ticket",
    status: 403,
    code: "insufficient_role",
  },
  {
    principal: "platform_admin",
    operation: "patch_ticket",
    status: 403,
    code: "no_active_org",
  },

  // PATCH .../status → IN_PROGRESS (from OPEN)
  { principal: "anonymous", operation: "patch_status", status: 401 },
  { principal: "org_admin", operation: "patch_status", status: 200 },
  { principal: "support_agent", operation: "patch_status", status: 200 },
  { principal: "reviewer", operation: "patch_status", status: 200 },
  {
    principal: "cross_org_guest",
    operation: "patch_status",
    status: 403,
    code: "insufficient_role",
  },
  {
    principal: "platform_admin",
    operation: "patch_status",
    status: 403,
    code: "no_active_org",
  },

  // DELETE /tickets/:id
  { principal: "anonymous", operation: "delete_ticket", status: 401 },
  { principal: "org_admin", operation: "delete_ticket", status: 204 },
  { principal: "support_agent", operation: "delete_ticket", status: 204 },
  { principal: "reviewer", operation: "delete_ticket", status: 204 },
  {
    principal: "cross_org_guest",
    operation: "delete_ticket",
    status: 403,
    code: "insufficient_role",
  },
  {
    principal: "platform_admin",
    operation: "delete_ticket",
    status: 403,
    code: "no_active_org",
  },

  // GET /org/settings
  { principal: "anonymous", operation: "get_settings", status: 401 },
  { principal: "org_admin", operation: "get_settings", status: 200 },
  { principal: "support_agent", operation: "get_settings", status: 200 },
  { principal: "reviewer", operation: "get_settings", status: 200 },
  { principal: "cross_org_guest", operation: "get_settings", status: 403, code: "insufficient_role" },
  {
    principal: "platform_admin",
    operation: "get_settings",
    status: 403,
    code: "no_active_org",
  },

  // PATCH /org/settings
  { principal: "anonymous", operation: "patch_settings", status: 401 },
  { principal: "org_admin", operation: "patch_settings", status: 200 },
  {
    principal: "support_agent",
    operation: "patch_settings",
    status: 403,
    code: "insufficient_role",
  },
  {
    principal: "reviewer",
    operation: "patch_settings",
    status: 403,
    code: "insufficient_role",
  },
  {
    principal: "cross_org_guest",
    operation: "patch_settings",
    status: 403,
    code: "insufficient_role",
  },
  {
    principal: "platform_admin",
    operation: "patch_settings",
    status: 403,
    code: "no_active_org",
  },

  // POST .../comments
  { principal: "anonymous", operation: "create_comment", status: 401 },
  { principal: "org_admin", operation: "create_comment", status: 201 },
  { principal: "support_agent", operation: "create_comment", status: 201 },
  { principal: "reviewer", operation: "create_comment", status: 201 },
  { principal: "cross_org_guest", operation: "create_comment", status: 201 },
  {
    principal: "platform_admin",
    operation: "create_comment",
    status: 403,
    code: "no_active_org",
  },

  // PATCH .../comments/:id (non-author guest path) — skipped for mutators
  { principal: "anonymous", operation: "patch_comment_guest", status: 401 },
  {
    principal: "cross_org_guest",
    operation: "patch_comment_guest",
    status: 403,
    code: "insufficient_role",
  },
  {
    principal: "platform_admin",
    operation: "patch_comment_guest",
    status: 403,
    code: "no_active_org",
  },

  // POST .../attachments
  { principal: "anonymous", operation: "upload_attachment", status: 401 },
  { principal: "org_admin", operation: "upload_attachment", status: 201 },
  { principal: "support_agent", operation: "upload_attachment", status: 201 },
  { principal: "reviewer", operation: "upload_attachment", status: 201 },
  {
    principal: "cross_org_guest",
    operation: "upload_attachment",
    status: 403,
    code: "insufficient_role",
  },
  {
    principal: "platform_admin",
    operation: "upload_attachment",
    status: 403,
    code: "no_active_org",
  },

  // GET .../attachments/:id/download
  { principal: "anonymous", operation: "download_attachment", status: 401 },
  { principal: "org_admin", operation: "download_attachment", status: 200 },
  { principal: "support_agent", operation: "download_attachment", status: 200 },
  { principal: "reviewer", operation: "download_attachment", status: 200 },
  { principal: "cross_org_guest", operation: "download_attachment", status: 200 },
  {
    principal: "platform_admin",
    operation: "download_attachment",
    status: 403,
    code: "no_active_org",
  },
];

  describe("ticket RBAC matrix", () => {
  let org: FixtureOrg;
  let supportAgent: FixtureUser;
  let guest: FixtureUser;

  let orgAdminClient: Awaited<ReturnType<typeof loginAgent>>;
  let agentClient: Awaited<ReturnType<typeof loginAgent>>;
  let reviewerClient: Awaited<ReturnType<typeof loginAgent>>;
  let guestClient: Awaited<ReturnType<typeof loginAgent>>;
  let platformClient: Awaited<ReturnType<typeof loginAgent>>;

  let seedTicketId: string;
  let seedCommentId: string;
  let seedAttachmentId: string;

  beforeAll(async () => {
    org = await createOrg();

    const orgAdmin = await createUser({
      orgs: [{ org, role: OrgRole.ORG_ADMIN }],
    });
    supportAgent = await createUser({
      orgs: [{ org, role: OrgRole.SUPPORT_AGENT }],
    });
    const reviewer = await createUser({
      orgs: [{ org, role: OrgRole.REVIEWER }],
    });
    guest = await createUser({
      orgs: [{ org, role: OrgRole.CROSS_ORG_GUEST }],
    });
    const platform = await createUser({ isPlatformAdmin: true });

    orgAdminClient = await loginAgent(orgAdmin.email);
    agentClient = await loginAgent(supportAgent.email);
    reviewerClient = await loginAgent(reviewer.email);
    guestClient = await loginAgent(guest.email);
    platformClient = await loginAgent(platform.email);

    const seedTicket = await createTicket({
      orgId: org.id,
      createdById: supportAgent.id,
      title: "RBAC matrix seed ticket",
      status: TicketStatus.OPEN,
      assigneeId: guest.id,
    });
    seedTicketId = seedTicket.id;

    const seedComment = await ownerDb.ticketComment.create({
      data: {
        ticketId: seedTicketId,
        orgId: org.id,
        authorId: supportAgent.id,
        body: "Agent-authored seed comment",
      },
    });
    seedCommentId = seedComment.id;

    const uploaded = await agentClient
      .post(`/tickets/${seedTicketId}/attachments`)
      .attach("file", Buffer.from("matrix-seed"), "matrix-seed.txt")
      .expect(201);
    seedAttachmentId = uploaded.body.id;
  });

  afterAll(async () => {
    await cleanupRunFixtures();
  });

  function clientFor(principal: Principal) {
    switch (principal) {
      case "anonymous":
        return agent();
      case "org_admin":
        return orgAdminClient;
      case "support_agent":
        return agentClient;
      case "reviewer":
        return reviewerClient;
      case "cross_org_guest":
        return guestClient;
      case "platform_admin":
        return platformClient;
      default:
        throw new Error(`Unknown principal: ${principal satisfies never}`);
    }
  }

  async function freshOpenTicket(title: string) {
    return createTicket({
      orgId: org.id,
      createdById: supportAgent.id,
      title,
      status: TicketStatus.OPEN,
    });
  }

  it.each(cases)(
    "$principal -> $operation = $status",
    async ({ principal, operation, status, code }) => {
      const client = clientFor(principal);
      let res;

      switch (operation) {
        case "list_tickets":
          res = await client.get("/tickets");
          break;

        case "get_ticket":
          res = await client.get(`/tickets/${seedTicketId}`);
          break;

        case "create_ticket":
          res = await client
            .post("/tickets")
            .set("Content-Type", "application/json")
            .send({ title: `Create by ${principal}` });
          break;

        case "patch_ticket": {
          const ticket = await freshOpenTicket(`Patch target ${principal}`);
          res = await client
            .patch(`/tickets/${ticket.id}`)
            .set("Content-Type", "application/json")
            .send({ title: `Patched by ${principal}` });
          break;
        }

        case "patch_status": {
          const ticket = await freshOpenTicket(`Status target ${principal}`);
          res = await client
            .patch(`/tickets/${ticket.id}/status`)
            .set("Content-Type", "application/json")
            .send({ status: TicketStatus.IN_PROGRESS });
          break;
        }

        case "delete_ticket": {
          const ticket = await freshOpenTicket(`Delete target ${principal}`);
          res = await client.delete(`/tickets/${ticket.id}`);
          break;
        }

        case "get_settings":
          res = await client.get("/org/settings");
          break;

        case "patch_settings":
          res = await client
            .patch("/org/settings")
            .set("Content-Type", "application/json")
            .send({
              featureFlags: {
                commentsEnabled: true,
                attachmentsEnabled: true,
              },
            });
          break;

        case "create_comment":
          res = await client
            .post(`/tickets/${seedTicketId}/comments`)
            .set("Content-Type", "application/json")
            .send({ body: `Comment by ${principal}` });
          break;

        case "patch_comment_guest":
          res = await client
            .patch(`/tickets/${seedTicketId}/comments/${seedCommentId}`)
            .set("Content-Type", "application/json")
            .send({ body: "Guest edit attempt" });
          break;

        case "upload_attachment":
          res = await client
            .post(`/tickets/${seedTicketId}/attachments`)
            .attach(
              "file",
              Buffer.from(`upload-${principal}`),
              `${principal}.txt`,
            );
          break;

        case "download_attachment":
          res = await client.get(
            `/tickets/${seedTicketId}/attachments/${seedAttachmentId}/download`,
          );
          break;

        default:
          throw new Error(`Unknown operation: ${operation satisfies never}`);
      }

      expect(res.status).toBe(status);
      if (code) {
        expect(res.body.code).toBe(code);
      }
    },
  );

  it("allows org admin to delete another user's attachment", async () => {
    const ticket = await freshOpenTicket("Admin override attachment delete");
    const uploaded = await agentClient
      .post(`/tickets/${ticket.id}/attachments`)
      .attach("file", Buffer.from("owned-by-agent"), "agent.txt")
      .expect(201);

    await orgAdminClient
      .delete(`/tickets/${ticket.id}/attachments/${uploaded.body.id}`)
      .expect(204);
  });

  it("rejects POST /tickets with non-JSON Content-Type", async () => {
    await agentClient
      .post("/tickets")
      .set("Content-Type", "text/plain")
      .send("title=nope")
      .expect(415)
      .expect((res) => {
        expect(res.body.code).toBe("unsupported_media_type");
      });
  });
});
