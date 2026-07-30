import { AuditAction, OrgRole } from "@unified/types";
import { afterAll, describe, expect, it } from "vitest";
import { ownerDb } from "../support/db.js";
import {
  cleanupRunFixtures,
  createOrg,
  createUser,
} from "../support/fixtures.js";
import { agent, loginAgent, waitForAudit } from "../support/http.js";

describe("org settings", () => {
  afterAll(async () => {
    await cleanupRunFixtures();
  });

  it("rejects unauthenticated GET and PATCH", async () => {
    const anon = agent();

    await anon.get("/org/settings").expect(401);
    await anon
      .patch("/org/settings")
      .set("Content-Type", "application/json")
      .send({ featureFlags: { commentsEnabled: false } })
      .expect(401);
  });

  it("returns merged defaults for readers", async () => {
    const org = await createOrg();
    const agentUser = await createUser({
      orgs: [{ org, role: OrgRole.SUPPORT_AGENT }],
    });

    const client = await loginAgent(agentUser.email);
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
    const agentUser = await createUser({
      orgs: [{ org, role: OrgRole.SUPPORT_AGENT }],
    });

    const client = await loginAgent(agentUser.email);
    await client
      .patch("/org/settings")
      .set("Content-Type", "application/json")
      .send({ featureFlags: { attachmentsEnabled: false } })
      .expect(403)
      .expect((res) => {
        expect(res.body.code).toBe("insufficient_role");
      });
  });

  it("rejects reviewer updates", async () => {
    const org = await createOrg();
    const reviewer = await createUser({
      orgs: [{ org, role: OrgRole.REVIEWER }],
    });

    const client = await loginAgent(reviewer.email);
    await client
      .patch("/org/settings")
      .set("Content-Type", "application/json")
      .send({ featureFlags: { commentsEnabled: false } })
      .expect(403)
      .expect((res) => {
        expect(res.body.code).toBe("insufficient_role");
      });
  });

  it("applies settings PATCH to the session org after switch", async () => {
    const orgA = await createOrg("Org A");
    const orgB = await createOrg("Org B");
    const admin = await createUser({
      orgs: [
        { org: orgA, role: OrgRole.ORG_ADMIN },
        { org: orgB, role: OrgRole.ORG_ADMIN },
      ],
    });

    const client = await loginAgent(admin.email);

    await client
      .patch("/org/settings")
      .set("Content-Type", "application/json")
      .send({ featureFlags: { commentsEnabled: false } })
      .expect(200);

    let getA = await client.get("/org/settings").expect(200);
    expect(getA.body.orgId).toBe(orgA.id);
    expect(getA.body.settings.featureFlags.commentsEnabled).toBe(false);

    await client
      .post("/auth/switch-org")
      .set("Content-Type", "application/json")
      .send({ orgId: orgB.id })
      .expect(200);

    await client
      .patch("/org/settings")
      .set("Content-Type", "application/json")
      .send({ featureFlags: { attachmentsEnabled: false } })
      .expect(200);

    const getB = await client.get("/org/settings").expect(200);
    expect(getB.body.orgId).toBe(orgB.id);
    expect(getB.body.settings.featureFlags.attachmentsEnabled).toBe(false);
    expect(getB.body.settings.featureFlags.commentsEnabled).toBe(true);

    await client
      .post("/auth/switch-org")
      .set("Content-Type", "application/json")
      .send({ orgId: orgA.id })
      .expect(200);

    getA = await client.get("/org/settings").expect(200);
    expect(getA.body.orgId).toBe(orgA.id);
    expect(getA.body.settings.featureFlags.commentsEnabled).toBe(false);
    expect(getA.body.settings.featureFlags.attachmentsEnabled).toBe(true);
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
