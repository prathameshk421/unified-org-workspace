import { OrgRole } from "@unified/types";
import { afterAll, describe, expect, it } from "vitest";
import { ownerDb } from "../support/db.js";
import { cleanupRunFixtures, createDigestRun, createOrg, createUser } from "../support/fixtures.js";
import { loginAgent } from "../support/http.js";
import { assertOwnerDbUnchanged } from "../support/product-bola-helpers.js";

async function createNotification(userId: string, digestRunId: string, title: string) {
  return ownerDb.notification.create({
    data: {
      userId,
      digestRunId,
      title,
      body: `${title} body`,
      facts: {},
      resourceIds: [],
    },
  });
}

describe("notifications BOLA", () => {
  afterAll(async () => {
    await cleanupRunFixtures();
  });

  it("notification.read.foreignId: marking another user's notification returns 404 and row unchanged", async () => {
    const org = await createOrg();
    const alice = await createUser({
      orgs: [{ org, role: OrgRole.ORG_ADMIN }],
    });
    const eve = await createUser({
      orgs: [{ org, role: OrgRole.SUPPORT_AGENT }],
    });
    const run = await createDigestRun({ status: "SUCCEEDED" });
    const foreign = await createNotification(eve.id, run.id, "Eve private notification");
    const before = await ownerDb.notification.findUniqueOrThrow({
      where: { id: foreign.id },
    });

    const aliceClient = await loginAgent(alice.email);
    const denied = await aliceClient.post(`/notifications/${foreign.id}/read`).expect(404);
    expect(denied.text).not.toContain("Eve private notification");

    await assertOwnerDbUnchanged({
      before,
      snapshot: () => ownerDb.notification.findUniqueOrThrow({ where: { id: foreign.id } }),
      expectEqual: (a, b) => expect(b).toEqual(a),
    });
  });

  it("notification.cursor.foreignId: foreign and unknown cursors return identical 400 responses", async () => {
    const org = await createOrg();
    const alice = await createUser({
      orgs: [{ org, role: OrgRole.ORG_ADMIN }],
    });
    const eve = await createUser({
      orgs: [{ org, role: OrgRole.SUPPORT_AGENT }],
    });
    const run = await createDigestRun({ status: "SUCCEEDED" });
    const foreign = await createNotification(eve.id, run.id, "Foreign cursor secret");
    await createNotification(alice.id, run.id, "Alice notification");

    const aliceClient = await loginAgent(alice.email);
    const foreignCursor = await aliceClient
      .get("/notifications")
      .query({ cursor: foreign.id })
      .expect(400);
    const unknownCursor = await aliceClient
      .get("/notifications")
      .query({ cursor: crypto.randomUUID() })
      .expect(400);

    expect(foreignCursor.body).toEqual(unknownCursor.body);
    expect(foreignCursor.body.code).toBe("invalid_cursor");
    expect(JSON.stringify(foreignCursor.body)).not.toContain("Foreign cursor secret");
  });

  it("notification.readAll.scoped: read-all leaves another user's notification unchanged", async () => {
    const org = await createOrg();
    const alice = await createUser({
      orgs: [{ org, role: OrgRole.ORG_ADMIN }],
    });
    const eve = await createUser({
      orgs: [{ org, role: OrgRole.SUPPORT_AGENT }],
    });
    const run = await createDigestRun({ status: "SUCCEEDED" });
    await createNotification(alice.id, run.id, "Alice unread");
    const foreign = await createNotification(eve.id, run.id, "Eve unread");
    const before = await ownerDb.notification.findUniqueOrThrow({
      where: { id: foreign.id },
    });

    const aliceClient = await loginAgent(alice.email);
    await aliceClient.post("/notifications/read-all").expect(204);

    await assertOwnerDbUnchanged({
      before,
      snapshot: () => ownerDb.notification.findUniqueOrThrow({ where: { id: foreign.id } }),
      expectEqual: (a, b) => expect(b).toEqual(a),
    });
    const aliceRows = await ownerDb.notification.findMany({ where: { userId: alice.id } });
    expect(aliceRows.every((row) => row.readAt !== null)).toBe(true);
  });
});
