import { OrgRole } from "@unified/types";
import { afterAll, describe, expect, it } from "vitest";
import { ownerDb } from "../../support/db.js";
import {
  cleanupRunFixtures,
  createOrg,
  createPullRequest,
  createTicket,
  createUser,
} from "../../support/fixtures.js";
import { loginAgent, mintToken } from "../../support/http.js";
import {
  assertOwnerAliveAttackerDenyOwnerUnchanged,
  assertOwnerDbUnchanged,
  snapshotPr,
} from "../../support/product-bola-helpers.js";

const CSV_HEADER = "id,createdAt,orgId,userId,action,entityType,entityId,metadata";

async function snapshotAuditLog(id: string) {
  const row = await ownerDb.auditLog.findUniqueOrThrow({ where: { id } });
  return {
    action: row.action,
    entityType: row.entityType,
    entityId: row.entityId,
    orgId: row.orgId,
    metadata: row.metadata,
  };
}

async function snapshotOrgSettings(orgId: string) {
  const row = await ownerDb.organization.findUniqueOrThrow({ where: { id: orgId } });
  return { settings: row.settings };
}

describe("product BOLA http method absence", () => {
  afterAll(async () => {
    await cleanupRunFixtures();
  });

  it("pr.delete.absent: DELETE /prs/:id returns 404 and row remains", async () => {
    const org = await createOrg("PR delete absent org");
    const admin = await createUser({
      orgs: [{ org, role: OrgRole.ORG_ADMIN }],
    });
    const pr = await createPullRequest({
      orgId: org.id,
      authorId: admin.id,
      title: "No delete route PR",
    });

    const client = await loginAgent(admin.email);

    await assertOwnerAliveAttackerDenyOwnerUnchanged({
      ownerAgent: client,
      ownerGetPath: `/prs/${pr.id}`,
      attack: () => client.delete(`/prs/${pr.id}`),
      snapshot: () => snapshotPr(pr.id),
      expectEqual: (before, after) => expect(after).toEqual(before),
      expectAttackStatus: 404,
    });

    const row = await ownerDb.pullRequest.findUnique({ where: { id: pr.id } });
    expect(row).not.toBeNull();
  });

  it("audit.list.scoped: list returns only active-org audit rows", async () => {
    const orgA = await createOrg("Acme");
    const orgB = await createOrg("Globex");
    const alice = await createUser({
      orgs: [{ org: orgA, role: OrgRole.ORG_ADMIN }],
    });
    const carol = await createUser({
      orgs: [{ org: orgB, role: OrgRole.ORG_ADMIN }],
    });

    await ownerDb.auditLog.createMany({
      data: [
        {
          orgId: orgA.id,
          userId: alice.id,
          action: "test.acme_only",
          entityType: "test",
          entityId: `acme-${Date.now()}`,
          metadata: { probe: "acme" },
        },
        {
          orgId: orgB.id,
          userId: carol.id,
          action: "test.globex_only",
          entityType: "test",
          entityId: `globex-${Date.now()}`,
          metadata: { probe: "globex" },
        },
      ],
    });

    const aliceClient = await loginAgent(alice.email);
    const list = await aliceClient.get("/audit").expect(200);

    expect(list.body.items.length).toBeGreaterThan(0);
    for (const row of list.body.items) {
      expect(row.orgId).toBe(orgA.id);
    }
    expect(
      list.body.items.some((row: { action: string }) => row.action === "test.globex_only"),
    ).toBe(false);
  });

  it("audit.orgIdFilter.forbidden: foreign orgId query filter returns 403", async () => {
    const orgA = await createOrg("Acme");
    const orgB = await createOrg("Globex");
    const alice = await createUser({
      orgs: [{ org: orgA, role: OrgRole.ORG_ADMIN }],
    });

    const aliceClient = await loginAgent(alice.email);
    await aliceClient
      .get(`/audit?orgId=${orgB.id}`)
      .expect(403)
      .expect((res) => {
        expect(res.body.code).toBe("org_filter_forbidden");
      });
  });

  it("audit.export.scoped: export CSV scoped to active org only", async () => {
    const orgA = await createOrg("Acme");
    const orgB = await createOrg("Globex");
    const alice = await createUser({
      orgs: [{ org: orgA, role: OrgRole.ORG_ADMIN }],
    });
    const carol = await createUser({
      orgs: [{ org: orgB, role: OrgRole.ORG_ADMIN }],
    });

    const acmeEntityId = `acme-export-${Date.now()}`;
    const globexEntityId = `globex-export-${Date.now()}`;

    await ownerDb.auditLog.createMany({
      data: [
        {
          orgId: orgA.id,
          userId: alice.id,
          action: "test.acme_export",
          entityType: "test",
          entityId: acmeEntityId,
          metadata: { probe: "acme-export" },
        },
        {
          orgId: orgB.id,
          userId: carol.id,
          action: "test.globex_export",
          entityType: "test",
          entityId: globexEntityId,
          metadata: { probe: "globex-export" },
        },
      ],
    });

    const aliceClient = await loginAgent(alice.email);
    const res = await aliceClient
      .get("/audit/export?action=test.acme_export")
      .expect(200);

    expect(res.headers["content-type"]).toMatch(/text\/csv/);

    const lines = String(res.text).trim().split("\n");
    expect(lines[0]).toBe(CSV_HEADER);
    expect(lines.length).toBeGreaterThan(1);

    const dataLines = lines.slice(1);
    for (const line of dataLines) {
      expect(line).toContain(orgA.id);
      expect(line).not.toContain(orgB.id);
      expect(line).not.toContain(globexEntityId);
    }
    expect(dataLines.some((line) => line.includes(acmeEntityId))).toBe(true);
  });

  it("audit.http.put.absent: PUT /audit returns 404", async () => {
    const org = await createOrg("Audit PUT absent");
    const admin = await createUser({
      orgs: [{ org, role: OrgRole.ORG_ADMIN }],
    });

    const client = await loginAgent(admin.email);
    await client
      .put("/audit")
      .set("Content-Type", "application/json")
      .send({ action: "forged" })
      .expect(404);
  });

  it("audit.http.patch.absent: PATCH /audit/:id returns 404 and row unchanged", async () => {
    const org = await createOrg("Audit PATCH absent");
    const admin = await createUser({
      orgs: [{ org, role: OrgRole.ORG_ADMIN }],
    });

    const row = await ownerDb.auditLog.create({
      data: {
        orgId: org.id,
        userId: admin.id,
        action: "test.patch_probe",
        entityType: "test",
        entityId: `patch-${Date.now()}`,
        metadata: { probe: "patch" },
      },
    });

    const before = await snapshotAuditLog(row.id);
    const client = await loginAgent(admin.email);

    await client
      .patch(`/audit/${row.id}`)
      .set("Content-Type", "application/json")
      .send({ action: "forged.action" })
      .expect(404);

    await assertOwnerDbUnchanged({
      before,
      snapshot: () => snapshotAuditLog(row.id),
      expectEqual: (a, b) => expect(b).toEqual(a),
    });
  });

  it("audit.http.delete.absent: DELETE /audit/:id returns 404 and row unchanged", async () => {
    const org = await createOrg("Audit DELETE absent");
    const admin = await createUser({
      orgs: [{ org, role: OrgRole.ORG_ADMIN }],
    });

    const row = await ownerDb.auditLog.create({
      data: {
        orgId: org.id,
        userId: admin.id,
        action: "test.delete_probe",
        entityType: "test",
        entityId: `delete-${Date.now()}`,
        metadata: { probe: "delete" },
      },
    });

    const before = await snapshotAuditLog(row.id);
    const client = await loginAgent(admin.email);

    await client.delete(`/audit/${row.id}`).expect(404);

    await assertOwnerDbUnchanged({
      before,
      snapshot: () => snapshotAuditLog(row.id),
      expectEqual: (a, b) => expect(b).toEqual(a),
    });
  });

  it("settings.patch.sessionOnly: body orgId ignored; foreign org settings unchanged", async () => {
    const orgA = await createOrg("Org A");
    const orgB = await createOrg("Org B");
    const admin = await createUser({
      orgs: [{ org: orgA, role: OrgRole.ORG_ADMIN }],
    });

    const foreignBefore = await snapshotOrgSettings(orgB.id);
    const client = await loginAgent(admin.email);

    // Strict schema rejects unknown orgId in body (400); session-only apply path is 200.
    await client
      .patch("/org/settings")
      .set("Content-Type", "application/json")
      .send({ featureFlags: { commentsEnabled: false } })
      .expect(200);

    const getRes = await client.get("/org/settings").expect(200);
    expect(getRes.body.orgId).toBe(orgA.id);
    expect(getRes.body.settings.featureFlags.commentsEnabled).toBe(false);

    await assertOwnerDbUnchanged({
      before: foreignBefore,
      snapshot: () => snapshotOrgSettings(orgB.id),
      expectEqual: (a, b) => expect(b).toEqual(a),
    });
  });

  it("settings.http.delete.absent: DELETE /org/settings returns 404 and settings unchanged", async () => {
    const org = await createOrg("Settings DELETE absent");
    const admin = await createUser({
      orgs: [{ org, role: OrgRole.ORG_ADMIN }],
    });

    const client = await loginAgent(admin.email);
    await client
      .patch("/org/settings")
      .set("Content-Type", "application/json")
      .send({ featureFlags: { commentsEnabled: false } })
      .expect(200);

    const before = await snapshotOrgSettings(org.id);

    await client.delete("/org/settings").expect(404);

    await assertOwnerDbUnchanged({
      before,
      snapshot: () => snapshotOrgSettings(org.id),
      expectEqual: (a, b) => expect(b).toEqual(a),
    });
  });

  it("auth.switchOrg.foreign: switch-org to foreign org returns 403; session unchanged", async () => {
    const orgA = await createOrg("Org A");
    const orgB = await createOrg("Org B");
    const alice = await createUser({
      orgs: [{ org: orgA, role: OrgRole.ORG_ADMIN }],
    });

    const client = await loginAgent(alice.email);
    await client
      .post("/auth/switch-org")
      .set("Content-Type", "application/json")
      .send({ orgId: orgB.id })
      .expect(403);

    const session = await ownerDb.session.findFirst({
      where: { userId: alice.id, revokedAt: null },
      orderBy: { createdAt: "desc" },
    });
    expect(session?.activeOrgId).toBe(orgA.id);
  });

  it("auth.queryOrgId.ignored: query orgId ignored; active org unchanged", async () => {
    const orgA = await createOrg("Org A");
    const orgB = await createOrg("Org B");
    const user = await createUser({
      orgs: [{ org: orgA, role: OrgRole.ORG_ADMIN }],
    });

    const client = await loginAgent(user.email);
    const probe = await client.get(`/rbac/org?orgId=${orgB.id}`).expect(200);
    expect(probe.body.orgId).toBe(orgA.id);
  });

  it("auth.bearerForged.cookieSessionWins: forged Bearer ignored; cookie session org wins", async () => {
    const orgA = await createOrg("Org A");
    const orgB = await createOrg("Org B");
    const user = await createUser({
      orgs: [
        { org: orgA, role: OrgRole.ORG_ADMIN },
        { org: orgB, role: OrgRole.REVIEWER },
      ],
    });

    const client = await loginAgent(user.email);
    const session = await ownerDb.session.findFirstOrThrow({
      where: { userId: user.id, revokedAt: null },
      orderBy: { createdAt: "desc" },
    });

    const forged = await mintToken({
      sub: user.id,
      sid: session.id,
      activeOrgId: orgB.id,
      role: OrgRole.ORG_ADMIN,
      isPlatformAdmin: false,
    });

    const res = await client
      .get("/rbac/org")
      .set("Authorization", `Bearer ${forged}`)
      .expect(200);

    expect(res.body.orgId).toBe(orgA.id);
    expect(res.body.role).toBe(OrgRole.ORG_ADMIN);
  });

  it("platformAdmin.noActiveOrg.ticketGet: platform admin without membership gets 403 no_active_org", async () => {
    const org = await createOrg("Platform probe org");
    const owner = await createUser({
      orgs: [{ org, role: OrgRole.ORG_ADMIN }],
    });
    const ticket = await createTicket({
      orgId: org.id,
      createdById: owner.id,
      title: "Platform admin probe ticket",
    });

    const platform = await createUser({ isPlatformAdmin: true });
    const platformClient = await loginAgent(platform.email);

    await platformClient
      .get(`/tickets/${ticket.id}`)
      .expect(403)
      .expect((res) => {
        expect(res.body.code).toBe("no_active_org");
      });
  });
});
