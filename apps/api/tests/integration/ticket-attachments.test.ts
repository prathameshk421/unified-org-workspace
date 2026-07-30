import { access, constants } from "node:fs/promises";
import path from "node:path";
import { AuditAction, OrgRole } from "@unified/types";
import { afterAll, describe, expect, it } from "vitest";
import { env } from "../../src/lib/env.js";
import { ownerDb } from "../support/db.js";
import {
  cleanupRunFixtures,
  createOrg,
  createTicket,
  createUser,
} from "../support/fixtures.js";
import { loginAgent, waitForAudit } from "../support/http.js";

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

describe("ticket attachments", () => {
  afterAll(async () => {
    await cleanupRunFixtures();
  });

  it("returns 404 for cross-org attachment access (BOLA)", async () => {
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
      .get(`/tickets/${foreignTicket.id}/attachments`)
      .expect(404)
      .expect((res) => {
        expect(res.body.error).toBe("Ticket not found");
      });

    await client
      .post(`/tickets/${foreignTicket.id}/attachments`)
      .attach("file", Buffer.from("hello"), "note.txt")
      .expect(404)
      .expect((res) => {
        expect(res.body.error).toBe("Ticket not found");
      });
  });

  it("returns 404 when uploading under a foreign ticketId", async () => {
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
      title: "Foreign upload ticket",
      createdById: bob.id,
    });

    const client = await loginAgent(alice.email);
    await client
      .post(`/tickets/${foreignTicket.id}/attachments`)
      .attach("file", Buffer.from("hijack"), "hijack.txt")
      .expect(404)
      .expect((res) => {
        expect(res.body.error).toBe("Ticket not found");
        expect(res.body.code).toBeUndefined();
      });
  });

  it("returns 404 when downloading under a foreign ticketId", async () => {
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
      title: "Foreign download ticket",
      createdById: bob.id,
    });

    const bobClient = await loginAgent(bob.email);
    const uploaded = await bobClient
      .post(`/tickets/${foreignTicket.id}/attachments`)
      .attach("file", Buffer.from("secret-bytes"), "secret.txt")
      .expect(201);

    const client = await loginAgent(alice.email);
    await client
      .get(
        `/tickets/${foreignTicket.id}/attachments/${uploaded.body.id}/download`,
      )
      .expect(404)
      .expect((res) => {
        expect(res.body.error).toBe("Ticket not found");
        expect(JSON.stringify(res.body)).not.toContain("secret-bytes");
      });
  });

  it("returns 404 for child-ID BOLA on foreign attachment", async () => {
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
    const foreignAttachment = await ownerDb.ticketAttachment.create({
      data: {
        ticketId: ticketB.id,
        orgId: orgB.id,
        uploadedById: bob.id,
        fileName: "secret.txt",
        mimeType: "text/plain",
        sizeBytes: 4,
        storageKey: `${orgB.id}/${ticketB.id}/fake_secret.txt`,
      },
    });

    const client = await loginAgent(alice.email);

    await client
      .get(`/tickets/${ticketA.id}/attachments/${foreignAttachment.id}`)
      .expect(404)
      .expect((res) => {
        expect(res.body.error).toBe("Attachment not found");
      });

    await client
      .delete(`/tickets/${ticketA.id}/attachments/${foreignAttachment.id}`)
      .expect(404);
  });

  it("allows guests to download but not upload", async () => {
    const org = await createOrg();
    const admin = await createUser({
      orgs: [{ org, role: OrgRole.ORG_ADMIN }],
    });
    const guest = await createUser({
      orgs: [{ org, role: OrgRole.CROSS_ORG_GUEST }],
    });

    const ticket = await createTicket({
      orgId: org.id,
      title: "Guest attachment ticket",
      createdById: admin.id,
    });

    const adminClient = await loginAgent(admin.email);
    const uploaded = await adminClient
      .post(`/tickets/${ticket.id}/attachments`)
      .attach("file", Buffer.from("guest-readable"), "note.txt")
      .expect(201);

    const guestClient = await loginAgent(guest.email);

    await guestClient
      .post(`/tickets/${ticket.id}/attachments`)
      .attach("file", Buffer.from("nope"), "nope.txt")
      .expect(403)
      .expect((res) => {
        expect(res.body.code).toBe("insufficient_role");
      });

    const download = await guestClient
      .get(
        `/tickets/${ticket.id}/attachments/${uploaded.body.id}/download`,
      )
      .expect(200);

    expect(download.text).toBe("guest-readable");
  });

  it("rejects invalid MIME and oversized files", async () => {
    const org = await createOrg();
    const admin = await createUser({
      orgs: [{ org, role: OrgRole.ORG_ADMIN }],
    });
    const ticket = await createTicket({
      orgId: org.id,
      title: "MIME ticket",
      createdById: admin.id,
    });

    const client = await loginAgent(admin.email);

    // PNG magic bytes spoofed as .exe content type via binary signature of MZ
    const peHeader = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00]);
    await client
      .post(`/tickets/${ticket.id}/attachments`)
      .attach("file", peHeader, "malware.exe")
      .expect(400)
      .expect((res) => {
        expect(res.body.code).toBe("invalid_file_type");
      });

    const tooLarge = Buffer.alloc(5_242_881, 0x61);
    await client
      .post(`/tickets/${ticket.id}/attachments`)
      .attach("file", tooLarge, "big.txt")
      .expect(413)
      .expect((res) => {
        expect(res.body.code).toBe("file_too_large");
      });
  });

  it("enforces attachment limit including concurrent uploads", async () => {
    const org = await createOrg();
    const admin = await createUser({
      orgs: [{ org, role: OrgRole.ORG_ADMIN }],
    });
    const ticket = await createTicket({
      orgId: org.id,
      title: "Limit ticket",
      createdById: admin.id,
    });

    const client = await loginAgent(admin.email);

    for (let i = 0; i < 9; i += 1) {
      await client
        .post(`/tickets/${ticket.id}/attachments`)
        .attach("file", Buffer.from(`file-${i}`), `f${i}.txt`)
        .expect(201);
    }

    const [first, second] = await Promise.all([
      client
        .post(`/tickets/${ticket.id}/attachments`)
        .attach("file", Buffer.from("tenth-a"), "a.txt"),
      client
        .post(`/tickets/${ticket.id}/attachments`)
        .attach("file", Buffer.from("tenth-b"), "b.txt"),
    ]);

    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual([201, 400]);

    const failed = first.status === 400 ? first : second;
    expect(failed.body.code).toBe("attachment_limit_exceeded");

    await client
      .post(`/tickets/${ticket.id}/attachments`)
      .attach("file", Buffer.from("eleventh"), "c.txt")
      .expect(400)
      .expect((res) => {
        expect(res.body.code).toBe("attachment_limit_exceeded");
      });
  });

  it("round-trips text upload/download and enforces delete ownership", async () => {
    const org = await createOrg();
    const uploader = await createUser({
      orgs: [{ org, role: OrgRole.SUPPORT_AGENT }],
    });
    const other = await createUser({
      orgs: [{ org, role: OrgRole.SUPPORT_AGENT }],
    });

    const ticket = await createTicket({
      orgId: org.id,
      title: "Round trip ticket",
      createdById: uploader.id,
    });

    const uploaderClient = await loginAgent(uploader.email);
    const payload = "hello attachment world";
    const uploaded = await uploaderClient
      .post(`/tickets/${ticket.id}/attachments`)
      .attach("file", Buffer.from(payload), "note.txt")
      .expect(201);

    const downloaded = await uploaderClient
      .get(
        `/tickets/${ticket.id}/attachments/${uploaded.body.id}/download`,
      )
      .expect(200);
    expect(downloaded.text).toBe(payload);

    const diskPath = path.join(env.attachmentsDir, uploaded.body.id);
    // storageKey is not in response — resolve from DB
    const row = await ownerDb.ticketAttachment.findUniqueOrThrow({
      where: { id: uploaded.body.id },
    });
    expect(await fileExists(path.join(env.attachmentsDir, row.storageKey))).toBe(
      true,
    );
    void diskPath;

    const otherClient = await loginAgent(other.email);
    await otherClient
      .delete(`/tickets/${ticket.id}/attachments/${uploaded.body.id}`)
      .expect(403)
      .expect((res) => {
        expect(res.body.code).toBe("not_attachment_owner");
      });

    await uploaderClient
      .delete(`/tickets/${ticket.id}/attachments/${uploaded.body.id}`)
      .expect(204);

    expect(await fileExists(path.join(env.attachmentsDir, row.storageKey))).toBe(
      false,
    );
  });

  it("allows org admin to delete another user's attachment", async () => {
    const org = await createOrg();
    const admin = await createUser({
      orgs: [{ org, role: OrgRole.ORG_ADMIN }],
    });
    const agent = await createUser({
      orgs: [{ org, role: OrgRole.SUPPORT_AGENT }],
    });

    const ticket = await createTicket({
      orgId: org.id,
      title: "Admin override delete",
      createdById: agent.id,
    });

    const agentClient = await loginAgent(agent.email);
    const uploaded = await agentClient
      .post(`/tickets/${ticket.id}/attachments`)
      .attach("file", Buffer.from("agent-owned"), "owned.txt")
      .expect(201);

    const adminClient = await loginAgent(admin.email);
    await adminClient
      .delete(`/tickets/${ticket.id}/attachments/${uploaded.body.id}`)
      .expect(204);
  });

  it("blocks upload when attachments disabled but allows list and DELETE", async () => {
    const org = await createOrg();
    const admin = await createUser({
      orgs: [{ org, role: OrgRole.ORG_ADMIN }],
    });

    const ticket = await createTicket({
      orgId: org.id,
      title: "Flagged attachments",
      createdById: admin.id,
    });

    const client = await loginAgent(admin.email);
    const uploaded = await client
      .post(`/tickets/${ticket.id}/attachments`)
      .attach("file", Buffer.from("keep"), "keep.txt")
      .expect(201);

    await ownerDb.organization.update({
      where: { id: org.id },
      data: {
        settings: {
          featureFlags: { commentsEnabled: true, attachmentsEnabled: false },
        },
      },
    });

    await client.get(`/tickets/${ticket.id}/attachments`).expect(200);

    await client
      .post(`/tickets/${ticket.id}/attachments`)
      .attach("file", Buffer.from("blocked"), "blocked.txt")
      .expect(403)
      .expect((res) => {
        expect(res.body.code).toBe("feature_disabled");
      });

    await client
      .delete(`/tickets/${ticket.id}/attachments/${uploaded.body.id}`)
      .expect(204);
  });

  it("removes attachment files when ticket is deleted", async () => {
    const org = await createOrg();
    const admin = await createUser({
      orgs: [{ org, role: OrgRole.ORG_ADMIN }],
    });
    const ticket = await createTicket({
      orgId: org.id,
      title: "Delete with files",
      createdById: admin.id,
    });

    const client = await loginAgent(admin.email);
    const uploaded = await client
      .post(`/tickets/${ticket.id}/attachments`)
      .attach("file", Buffer.from("cleanup-me"), "cleanup.txt")
      .expect(201);

    const row = await ownerDb.ticketAttachment.findUniqueOrThrow({
      where: { id: uploaded.body.id },
    });
    const fullPath = path.join(env.attachmentsDir, row.storageKey);
    expect(await fileExists(fullPath)).toBe(true);

    await client.delete(`/tickets/${ticket.id}`).expect(204);
    expect(await fileExists(fullPath)).toBe(false);
  });

  it("writes attachment.upload audit row", async () => {
    const org = await createOrg();
    const admin = await createUser({
      orgs: [{ org, role: OrgRole.ORG_ADMIN }],
    });
    const ticket = await createTicket({
      orgId: org.id,
      title: "Audit attachment",
      createdById: admin.id,
    });

    const client = await loginAgent(admin.email);
    const uploaded = await client
      .post(`/tickets/${ticket.id}/attachments`)
      .attach("file", Buffer.from("audited"), "audit.txt")
      .expect(201);

    await waitForAudit(
      (row) =>
        row.action === AuditAction.ATTACHMENT_UPLOAD &&
        row.userId === admin.id &&
        row.orgId === org.id &&
        row.entityType === "TicketAttachment" &&
        row.entityId === uploaded.body.id,
    );
  });
});
