import { AuditAction } from "@unified/types";
import { OrgRole } from "@unified/types";
import { afterAll, describe, expect, it } from "vitest";
import { appDb, ownerDb } from "../support/db.js";
import {
  cleanupRunFixtures,
  createOrg,
  createUser,
} from "../support/fixtures.js";
import { agent, loginAgent, waitForAudit } from "../support/http.js";

function isPermissionDenied(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return (
    message.includes("permission denied") ||
    message.includes("42501") ||
    message.includes("p2010")
  );
}

describe("audit", () => {
  afterAll(async () => {
    await cleanupRunFixtures();
  });

  it("writes auth.switch_org audit row", async () => {
    const orgA = await createOrg("Org A");
    const orgB = await createOrg("Org B");
    const user = await createUser({
      orgs: [
        { org: orgA, role: OrgRole.ORG_ADMIN },
        { org: orgB, role: OrgRole.REVIEWER },
      ],
    });

    const client = await loginAgent(user.email);
    await client
      .post("/auth/switch-org")
      .set("Content-Type", "application/json")
      .send({ orgId: orgB.id })
      .expect(200);

    await waitForAudit(
      (row) =>
        row.action === AuditAction.AUTH_SWITCH_ORG &&
        row.userId === user.id &&
        row.orgId === orgB.id,
    );
  });

  it("writes auth.logout and auth.logout_everywhere audit rows", async () => {
    const org = await createOrg();
    const user = await createUser({
      orgs: [{ org, role: OrgRole.ORG_ADMIN }],
    });

    const logoutClient = await loginAgent(user.email);
    await logoutClient
      .post("/auth/logout")
      .set("Content-Type", "application/json")
      .send({})
      .expect(200);

    await waitForAudit(
      (row) =>
        row.action === AuditAction.AUTH_LOGOUT && row.userId === user.id,
    );

    const everywhereClient = await loginAgent(user.email);
    await everywhereClient
      .post("/auth/logout-everywhere")
      .set("Content-Type", "application/json")
      .send({})
      .expect(200);

    await waitForAudit(
      (row) =>
        row.action === AuditAction.AUTH_LOGOUT_EVERYWHERE &&
        row.userId === user.id,
    );
  });

  it("does not write audit rows for failed login or refresh", async () => {
    const before = await ownerDb.auditLog.count();

    await agent()
      .post("/auth/login")
      .set("Content-Type", "application/json")
      .send({ email: "missing@vtest.local", password: "password123" })
      .expect(401);

    await agent()
      .post("/auth/refresh")
      .set("Content-Type", "application/json")
      .send({})
      .expect(401);

    const after = await ownerDb.auditLog.count();
    expect(after).toBe(before);
  });

  it("denies UPDATE/DELETE/TRUNCATE/ALTER on audit_logs for unified_app", async () => {
    const row = await appDb.auditLog.create({
      data: {
        orgId: null,
        userId: null,
        action: "test.append_only",
        entityType: "test",
        entityId: `verify-${Date.now()}`,
        metadata: { probe: true },
      },
    });

    await expect(
      appDb.$executeRaw`UPDATE audit_logs SET action = 'hacked' WHERE id = ${row.id}`,
    ).rejects.toSatisfy(isPermissionDenied);

    await expect(
      appDb.$executeRaw`DELETE FROM audit_logs WHERE id = ${row.id}`,
    ).rejects.toSatisfy(isPermissionDenied);

    await expect(
      appDb.$executeRaw`TRUNCATE TABLE audit_logs`,
    ).rejects.toSatisfy(isPermissionDenied);

    await expect(
      appDb.$executeRaw`ALTER TABLE audit_logs ADD COLUMN hacked boolean`,
    ).rejects.toSatisfy(isPermissionDenied);

    await ownerDb.$executeRaw`DELETE FROM audit_logs WHERE id = ${row.id}`;
  });
});
