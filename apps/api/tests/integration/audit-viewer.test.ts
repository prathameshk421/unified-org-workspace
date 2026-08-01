import { AuditAction, OrgRole } from "@unified/types";
import { afterAll, describe, expect, it } from "vitest";
import { ownerDb } from "../support/db.js";
import { cleanupRunFixtures, createOrg, createUser } from "../support/fixtures.js";
import { loginAgent, waitForAudit } from "../support/http.js";

const CSV_HEADER = "id,createdAt,orgId,userId,action,entityType,entityId,metadata";

describe("audit viewer", () => {
  afterAll(async () => {
    await cleanupRunFixtures();
  });

  it("returns only audit rows for the active org", async () => {
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

  it("rejects foreign orgId query filter with org_filter_forbidden", async () => {
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

  it("filters actors by accepted active-org membership without disclosing another org", async () => {
    const orgA = await createOrg("Acme");
    const orgB = await createOrg("Globex");
    const admin = await createUser({ orgs: [{ org: orgA, role: OrgRole.ORG_ADMIN }] });
    const acmeActor = await createUser({
      name: "Ada Lovelace",
      email: "ada.lovelace@example.test",
      orgs: [{ org: orgA, role: OrgRole.REVIEWER }],
    });
    const globexActor = await createUser({
      name: "Ada Globex",
      email: "ada.globex@example.test",
      orgs: [{ org: orgB, role: OrgRole.REVIEWER }],
    });

    await ownerDb.auditLog.createMany({
      data: [
        {
          orgId: orgA.id,
          userId: acmeActor.id,
          action: "test.user_query",
          entityType: "test",
          entityId: "acme-user-query",
          metadata: {},
        },
        {
          orgId: orgB.id,
          userId: globexActor.id,
          action: "test.user_query",
          entityType: "test",
          entityId: "globex-user-query",
          metadata: {},
        },
      ],
    });

    const client = await loginAgent(admin.email);
    const byName = await client.get("/audit?userQuery=lovelace").expect(200);
    expect(
      byName.body.items.some((row: { entityId: string }) => row.entityId === "acme-user-query"),
    ).toBe(true);
    expect(
      byName.body.items.some((row: { entityId: string }) => row.entityId === "globex-user-query"),
    ).toBe(false);
    expect(
      byName.body.items.find((row: { userId: string }) => row.userId === acmeActor.id).actor,
    ).toMatchObject({
      id: acmeActor.id,
      name: acmeActor.name,
      email: acmeActor.email,
    });

    const byEmail = await client.get("/audit?userQuery=ADA.LOVELACE").expect(200);
    expect(byEmail.body.items.some((row: { userId: string }) => row.userId === acmeActor.id)).toBe(
      true,
    );
    expect(
      byEmail.body.items.some((row: { userId: string }) => row.userId === globexActor.id),
    ).toBe(false);
  });

  it("rejects SUPPORT_AGENT on /audit with insufficient_role", async () => {
    const org = await createOrg("Acme");
    const bob = await createUser({
      orgs: [{ org, role: OrgRole.SUPPORT_AGENT }],
    });

    const bobClient = await loginAgent(bob.email);

    await bobClient
      .get("/audit")
      .expect(403)
      .expect((res) => {
        expect(res.body.code).toBe("insufficient_role");
      });
  });

  it("writes pr.create audit row with session orgId on PR create", async () => {
    const org = await createOrg("Acme");
    const alice = await createUser({
      orgs: [{ org, role: OrgRole.ORG_ADMIN }],
    });

    const aliceClient = await loginAgent(alice.email);

    const auditSince = new Date();
    const created = await aliceClient
      .post("/prs")
      .set("Content-Type", "application/json")
      .send({ title: "Audit trail PR" })
      .expect(201);

    await waitForAudit(
      (row) =>
        row.action === AuditAction.PR_CREATE &&
        row.userId === alice.id &&
        row.orgId === org.id &&
        row.entityType === "pull_request" &&
        row.entityId === created.body.id,
      auditSince,
    );
  });

  it("exports CSV with header and scoped rows only", async () => {
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
    const res = await aliceClient.get("/audit/export?action=test.acme_export").expect(200);

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
});
