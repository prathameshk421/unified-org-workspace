import { AuditAction, OrgRole } from "@unified/types";
import { afterAll, describe, expect, it } from "vitest";
import { ownerDb } from "../support/db.js";
import {
  cleanupRunFixtures,
  createOrg,
  createUser,
} from "../support/fixtures.js";
import { loginAgent, waitForAudit } from "../support/http.js";

describe("org settings", () => {
  afterAll(async () => {
    await cleanupRunFixtures();
  });

  it("returns merged defaults for readers", async () => {
    const org = await createOrg();
    const agent = await createUser({
      orgs: [{ org, role: OrgRole.SUPPORT_AGENT }],
    });

    const client = await loginAgent(agent.email);
    const res = await client.get("/org/settings").expect(200);

    expect(res.body.orgId).toBe(org.id);
    expect(res.body.settings.featureFlags).toEqual({
      commentsEnabled: true,
      attachmentsEnabled: true,
    });
  });

  it("allows ORG_ADMIN to update flags and writes audit", async () => {
    const org = await createOrg();
    const admin = await createUser({
      orgs: [{ org, role: OrgRole.ORG_ADMIN }],
    });

    const client = await loginAgent(admin.email);
    const res = await client
      .patch("/org/settings")
      .set("Content-Type", "application/json")
      .send({ featureFlags: { commentsEnabled: false } })
      .expect(200);

    expect(res.body.settings.featureFlags.commentsEnabled).toBe(false);
    expect(res.body.settings.featureFlags.attachmentsEnabled).toBe(true);

    await waitForAudit(
      (row) =>
        row.action === AuditAction.ORG_SETTINGS_UPDATE &&
        row.userId === admin.id &&
        row.orgId === org.id &&
        row.entityType === "Organization" &&
        row.entityId === org.id,
    );
  });

  it("rejects non-admin updates", async () => {
    const org = await createOrg();
    const agent = await createUser({
      orgs: [{ org, role: OrgRole.SUPPORT_AGENT }],
    });

    const client = await loginAgent(agent.email);
    await client
      .patch("/org/settings")
      .set("Content-Type", "application/json")
      .send({ featureFlags: { attachmentsEnabled: false } })
      .expect(403)
      .expect((res) => {
        expect(res.body.code).toBe("insufficient_role");
      });
  });

  it("ignores body orgId and applies to session org only", async () => {
    const orgA = await createOrg("Org A");
    const orgB = await createOrg("Org B");
    const admin = await createUser({
      orgs: [{ org: orgA, role: OrgRole.ORG_ADMIN }],
    });

    const client = await loginAgent(admin.email);
    await client
      .patch("/org/settings")
      .set("Content-Type", "application/json")
      .send({
        orgId: orgB.id,
        featureFlags: { commentsEnabled: false },
      })
      .expect(400);

    // strict schema rejects unknown orgId key — also verify via owner update path
    await client
      .patch("/org/settings")
      .set("Content-Type", "application/json")
      .send({ featureFlags: { commentsEnabled: false } })
      .expect(200);

    const getRes = await client.get("/org/settings").expect(200);
    expect(getRes.body.orgId).toBe(orgA.id);
    expect(getRes.body.settings.featureFlags.commentsEnabled).toBe(false);

    const orgBRow = await ownerDb.organization.findUniqueOrThrow({
      where: { id: orgB.id },
    });
    const settings =
      orgBRow.settings && typeof orgBRow.settings === "object"
        ? (orgBRow.settings as Record<string, unknown>)
        : {};
    expect(settings).not.toEqual(
      expect.objectContaining({
        featureFlags: expect.objectContaining({ commentsEnabled: false }),
      }),
    );
  });
});
