import { OrgRole } from "@unified/types";
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
  assertOwnerAliveAttackerDenyOwnerUnchanged,
  assertOwnerDbUnchanged,
  snapshotAttachment,
  snapshotComment,
} from "../../support/product-bola-helpers.js";
import {
  createConnectedShareWorld,
  createSharedTicket,
} from "../../support/share-fixtures.js";

describe("product BOLA nested id confusion (comments + attachments)", () => {
  afterAll(async () => {
    await cleanupRunFixtures();
  });

  it("ticket.comment.list.foreign.parent: list comments under foreign ticket returns 404", async () => {
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
        body: "Secret nested comment",
      },
    });

    const attacker = await loginAgent(alice.email);
    await attacker
      .get(`/tickets/${foreignTicket.id}/comments`)
      .expect(404)
      .expect((res) => {
        expect(res.body.error).toBe("Ticket not found");
        expect(JSON.stringify(res.body)).not.toContain("Secret nested comment");
      });
  });

  it("ticket.comment.create.foreign.parent: create comment under foreign ticket returns 404", async () => {
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

    const attacker = await loginAgent(alice.email);
    await attacker
      .post(`/tickets/${foreignTicket.id}/comments`)
      .set("Content-Type", "application/json")
      .send({ body: "Should not land" })
      .expect(404)
      .expect((res) => {
        expect(res.body.error).toBe("Ticket not found");
        expect(res.body.code).toBeUndefined();
      });
  });

  it("ticket.comment.patch.child.crossOrg: PATCH foreign commentId returns 404 and ownerDb unchanged", async () => {
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
        body: "Secret cross-org comment",
      },
    });

    const owner = await loginAgent(bob.email);
    const attacker = await loginAgent(alice.email);

    await assertOwnerAliveAttackerDenyOwnerUnchanged({
      ownerAgent: owner,
      ownerGetPath: `/tickets/${ticketB.id}`,
      attack: () =>
        attacker
          .patch(`/tickets/${ticketA.id}/comments/${foreignComment.id}`)
          .set("Content-Type", "application/json")
          .send({ body: "Hijacked" }),
      snapshot: () => snapshotComment(foreignComment.id),
      expectEqual: (before, after) => expect(after).toEqual(before),
      expectAttackStatus: 404,
      forbiddenBodySubstrings: ["Secret cross-org comment"],
    });
  });

  it("ticket.comment.delete.child.crossOrg: DELETE foreign commentId returns 404 and row remains", async () => {
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
        body: "Must remain",
      },
    });

    const owner = await loginAgent(bob.email);
    const attacker = await loginAgent(alice.email);

    await assertOwnerAliveAttackerDenyOwnerUnchanged({
      ownerAgent: owner,
      ownerGetPath: `/tickets/${ticketB.id}`,
      attack: () =>
        attacker.delete(
          `/tickets/${ticketA.id}/comments/${foreignComment.id}`,
        ),
      snapshot: () => snapshotComment(foreignComment.id),
      expectEqual: (before, after) => expect(after).toEqual(before),
      expectAttackStatus: 404,
      forbiddenBodySubstrings: ["Must remain"],
    });

    const row = await ownerDb.ticketComment.findUnique({
      where: { id: foreignComment.id },
    });
    expect(row).not.toBeNull();
  });

  it("ticket.comment.patch.sameOrg.siblingParent: comment under wrong sibling ticket path returns 404", async () => {
    const org = await createOrg("Sibling org");
    const alice = await createUser({
      orgs: [{ org, role: OrgRole.ORG_ADMIN }],
    });

    const ticketA = await createTicket({
      orgId: org.id,
      title: "Ticket A",
      createdById: alice.id,
    });
    const ticketB = await createTicket({
      orgId: org.id,
      title: "Ticket B",
      createdById: alice.id,
    });
    const comment = await ownerDb.ticketComment.create({
      data: {
        ticketId: ticketA.id,
        orgId: org.id,
        authorId: alice.id,
        body: "On ticket A",
      },
    });

    const owner = await loginAgent(alice.email);

    await assertOwnerAliveAttackerDenyOwnerUnchanged({
      ownerAgent: owner,
      ownerGetPath: `/tickets/${ticketA.id}/comments`,
      attack: () =>
        owner
          .patch(`/tickets/${ticketB.id}/comments/${comment.id}`)
          .set("Content-Type", "application/json")
          .send({ body: "Wrong parent path" }),
      snapshot: () => snapshotComment(comment.id),
      expectEqual: (before, after) => expect(after).toEqual(before),
      expectAttackStatus: 404,
      forbiddenBodySubstrings: ["On ticket A"],
    });
  });

  it("ticket.comment.delete.sameOrg.siblingParent: delete comment under wrong sibling ticket path returns 404", async () => {
    const org = await createOrg("Sibling org");
    const alice = await createUser({
      orgs: [{ org, role: OrgRole.ORG_ADMIN }],
    });

    const ticketA = await createTicket({
      orgId: org.id,
      title: "Ticket A",
      createdById: alice.id,
    });
    const ticketB = await createTicket({
      orgId: org.id,
      title: "Ticket B",
      createdById: alice.id,
    });
    const comment = await ownerDb.ticketComment.create({
      data: {
        ticketId: ticketA.id,
        orgId: org.id,
        authorId: alice.id,
        body: "Sibling delete probe",
      },
    });

    const owner = await loginAgent(alice.email);

    await assertOwnerAliveAttackerDenyOwnerUnchanged({
      ownerAgent: owner,
      ownerGetPath: `/tickets/${ticketA.id}/comments`,
      attack: () =>
        owner.delete(`/tickets/${ticketB.id}/comments/${comment.id}`),
      snapshot: () => snapshotComment(comment.id),
      expectEqual: (before, after) => expect(after).toEqual(before),
      expectAttackStatus: 404,
      forbiddenBodySubstrings: ["Sibling delete probe"],
    });

    const row = await ownerDb.ticketComment.findUnique({
      where: { id: comment.id },
    });
    expect(row).not.toBeNull();
  });

  it("ticket.attach.list.foreign: list attachments under foreign ticket returns 404", async () => {
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
      title: "Foreign list-attach ticket",
      createdById: bob.id,
    });

    const attacker = await loginAgent(alice.email);
    await attacker
      .get(`/tickets/${foreignTicket.id}/attachments`)
      .expect(404)
      .expect((res) => {
        expect(res.body.error).toBe("Ticket not found");
      });
  });

  it("ticket.attach.upload.foreign: upload under foreign ticket returns 404", async () => {
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

    const attacker = await loginAgent(alice.email);
    await attacker
      .post(`/tickets/${foreignTicket.id}/attachments`)
      .attach("file", Buffer.from("hijack"), "hijack.txt")
      .expect(404)
      .expect((res) => {
        expect(res.body.error).toBe("Ticket not found");
        expect(res.body.code).toBeUndefined();
      });
  });

  it("ticket.attach.meta.foreign: meta under foreign ticket returns 404", async () => {
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
      title: "Foreign meta ticket",
      createdById: bob.id,
    });
    const foreignAttachment = await ownerDb.ticketAttachment.create({
      data: {
        ticketId: foreignTicket.id,
        orgId: orgB.id,
        uploadedById: bob.id,
        fileName: "secret.txt",
        mimeType: "text/plain",
        sizeBytes: 6,
        storageKey: `${orgB.id}/${foreignTicket.id}/secret.txt`,
      },
    });

    const attacker = await loginAgent(alice.email);
    await attacker
      .get(
        `/tickets/${foreignTicket.id}/attachments/${foreignAttachment.id}`,
      )
      .expect(404)
      .expect((res) => {
        expect(res.body.error).toBe("Ticket not found");
        expect(JSON.stringify(res.body)).not.toContain("secret.txt");
      });
  });

  it("ticket.attach.download.foreign: download under foreign ticket returns 404", async () => {
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

    const attacker = await loginAgent(alice.email);
    await attacker
      .get(
        `/tickets/${foreignTicket.id}/attachments/${uploaded.body.id}/download`,
      )
      .expect(404)
      .expect((res) => {
        expect(res.body.error).toBe("Ticket not found");
        expect(JSON.stringify(res.body)).not.toContain("secret-bytes");
      });
  });

  it("ticket.attach.delete.foreign: DELETE foreign attachment returns 404 and row remains", async () => {
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

    const owner = await loginAgent(bob.email);
    const attacker = await loginAgent(alice.email);
    const before = await snapshotAttachment(foreignAttachment.id);

    await owner.get(`/tickets/${ticketB.id}/attachments`).expect(200);

    const attackRes = await attacker.delete(
      `/tickets/${ticketA.id}/attachments/${foreignAttachment.id}`,
    );
    expect(attackRes.status).toBe(404);
    expect(attackRes.body.error).toBe("Attachment not found");

    await assertOwnerDbUnchanged({
      before,
      snapshot: () => snapshotAttachment(foreignAttachment.id),
      expectEqual: (b, a) => expect(a).toEqual(b),
    });

    await owner.get(`/tickets/${ticketB.id}/attachments`).expect(200);

    const row = await ownerDb.ticketAttachment.findUnique({
      where: { id: foreignAttachment.id },
    });
    expect(row).not.toBeNull();
  });

  it("ticket.attach.meta.sameOrg.siblingParent: meta with wrong parent ticketId returns 404", async () => {
    const org = await createOrg("Sibling org");
    const alice = await createUser({
      orgs: [{ org, role: OrgRole.ORG_ADMIN }],
    });

    const ticketA = await createTicket({
      orgId: org.id,
      title: "Ticket A",
      createdById: alice.id,
    });
    const ticketB = await createTicket({
      orgId: org.id,
      title: "Ticket B",
      createdById: alice.id,
    });

    const client = await loginAgent(alice.email);
    const uploaded = await client
      .post(`/tickets/${ticketA.id}/attachments`)
      .attach("file", Buffer.from("on-ticket-a"), "a.txt")
      .expect(201);

    await client
      .get(`/tickets/${ticketB.id}/attachments/${uploaded.body.id}`)
      .expect(404)
      .expect((res) => {
        expect(res.body.error).toBe("Attachment not found");
        expect(JSON.stringify(res.body)).not.toContain("on-ticket-a");
      });
  });

  it("ticket.attach.download.sameOrg.siblingParent: download with wrong parent ticketId returns 404", async () => {
    const org = await createOrg("Sibling org");
    const alice = await createUser({
      orgs: [{ org, role: OrgRole.ORG_ADMIN }],
    });

    const ticketA = await createTicket({
      orgId: org.id,
      title: "Ticket A",
      createdById: alice.id,
    });
    const ticketB = await createTicket({
      orgId: org.id,
      title: "Ticket B",
      createdById: alice.id,
    });

    const client = await loginAgent(alice.email);
    const uploaded = await client
      .post(`/tickets/${ticketA.id}/attachments`)
      .attach("file", Buffer.from("sibling-download-probe"), "probe.txt")
      .expect(201);

    await client
      .get(
        `/tickets/${ticketB.id}/attachments/${uploaded.body.id}/download`,
      )
      .expect(404)
      .expect((res) => {
        expect(res.body.error).toBe("Attachment not found");
        expect(JSON.stringify(res.body)).not.toContain("sibling-download-probe");
      });
  });

  it("ticket.attach.delete.sameOrg.siblingParent: delete with wrong parent ticketId returns 404", async () => {
    const org = await createOrg("Sibling org");
    const alice = await createUser({
      orgs: [{ org, role: OrgRole.ORG_ADMIN }],
    });

    const ticketA = await createTicket({
      orgId: org.id,
      title: "Ticket A",
      createdById: alice.id,
    });
    const ticketB = await createTicket({
      orgId: org.id,
      title: "Ticket B",
      createdById: alice.id,
    });

    const owner = await loginAgent(alice.email);
    const uploaded = await owner
      .post(`/tickets/${ticketA.id}/attachments`)
      .attach("file", Buffer.from("keep-me"), "keep.txt")
      .expect(201);

    await assertOwnerAliveAttackerDenyOwnerUnchanged({
      ownerAgent: owner,
      ownerGetPath: `/tickets/${ticketA.id}/attachments`,
      attack: () =>
        owner.delete(
          `/tickets/${ticketB.id}/attachments/${uploaded.body.id}`,
        ),
      snapshot: () => snapshotAttachment(uploaded.body.id),
      expectEqual: (before, after) => expect(after).toEqual(before),
      expectAttackStatus: 404,
      forbiddenBodySubstrings: ["keep-me"],
    });

    const row = await ownerDb.ticketAttachment.findUnique({
      where: { id: uploaded.body.id },
    });
    expect(row).not.toBeNull();
  });

  it("ticket.attach.meta.share.sibling: shared ticketId + sibling attachmentId returns 404", async () => {
    const world = await createConnectedShareWorld();
    const shared = await createSharedTicket({
      ownerOrg: world.orgA,
      granteeOrg: world.orgB,
      createdById: world.alice.id,
      grantedToUserId: world.eve.id,
      grantedByUserId: world.alice.id,
      orgConnectionId: world.connection.id,
    });

    const aliceClient = await loginAgent(world.alice.email);
    const siblingUpload = await aliceClient
      .post(`/tickets/${shared.unsharedSiblingId}/attachments`)
      .attach("file", Buffer.from("sibling-meta-bytes"), "sibling.txt")
      .expect(201);

    const eveClient = await loginAgent(world.eve.email);
    await eveClient
      .get(
        `/tickets/${shared.ticketId}/attachments/${siblingUpload.body.id}`,
      )
      .expect(404)
      .expect((res) => {
        expect(res.body.error).toBe("Attachment not found");
        expect(JSON.stringify(res.body)).not.toContain("sibling-meta-bytes");
      });
  });

  it("ticket.attach.download.share.sibling: shared ticketId + sibling attachment download returns 404", async () => {
    const world = await createConnectedShareWorld();
    const shared = await createSharedTicket({
      ownerOrg: world.orgA,
      granteeOrg: world.orgB,
      createdById: world.alice.id,
      grantedToUserId: world.eve.id,
      grantedByUserId: world.alice.id,
      orgConnectionId: world.connection.id,
    });

    const aliceClient = await loginAgent(world.alice.email);
    const siblingUpload = await aliceClient
      .post(`/tickets/${shared.unsharedSiblingId}/attachments`)
      .attach("file", Buffer.from("sibling-dl-bytes"), "sibling-dl.txt")
      .expect(201);

    const eveClient = await loginAgent(world.eve.email);
    await eveClient
      .get(
        `/tickets/${shared.ticketId}/attachments/${siblingUpload.body.id}/download`,
      )
      .expect(404)
      .expect((res) => {
        expect(res.body.error).toBe("Attachment not found");
        expect(JSON.stringify(res.body)).not.toContain("sibling-dl-bytes");
      });
  });

  it("ticket.attach.flag.sharedDownloadAllowed: attachmentsEnabled=false still allows shared download", async () => {
    const world = await createConnectedShareWorld();
    const shared = await createSharedTicket({
      ownerOrg: world.orgA,
      granteeOrg: world.orgB,
      createdById: world.alice.id,
      grantedToUserId: world.eve.id,
      grantedByUserId: world.alice.id,
      orgConnectionId: world.connection.id,
    });

    const aliceClient = await loginAgent(world.alice.email);
    const sharedUpload = await aliceClient
      .post(`/tickets/${shared.ticketId}/attachments`)
      .attach("file", Buffer.from("flagged-shared-bytes"), "shared.txt")
      .expect(201);

    await ownerDb.organization.update({
      where: { id: world.orgA.id },
      data: {
        settings: {
          featureFlags: { commentsEnabled: true, attachmentsEnabled: false },
        },
      },
    });

    const eveClient = await loginAgent(world.eve.email);
    const download = await eveClient
      .get(
        `/tickets/${shared.ticketId}/attachments/${sharedUpload.body.id}/download`,
      )
      .expect(200);

    expect(download.text).toBe("flagged-shared-bytes");
  });

  it("ticket.attach.flag.sharedUploadBlocked: attachmentsEnabled=false shared upload returns 404", async () => {
    const world = await createConnectedShareWorld();
    const shared = await createSharedTicket({
      ownerOrg: world.orgA,
      granteeOrg: world.orgB,
      createdById: world.alice.id,
      grantedToUserId: world.eve.id,
      grantedByUserId: world.alice.id,
      orgConnectionId: world.connection.id,
    });

    await ownerDb.organization.update({
      where: { id: world.orgA.id },
      data: {
        settings: {
          featureFlags: { commentsEnabled: true, attachmentsEnabled: false },
        },
      },
    });

    const eveClient = await loginAgent(world.eve.email);
    await eveClient
      .post(`/tickets/${shared.ticketId}/attachments`)
      .attach("file", Buffer.from("blocked-upload"), "blocked.txt")
      .expect(404)
      .expect((res) => {
        expect(res.body.error).toBe("Ticket not found");
        expect(res.body.code).toBeUndefined();
      });
  });
});
