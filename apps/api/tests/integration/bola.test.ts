import { OrgRole } from "@unified/types";
import { afterAll, describe, expect, it } from "vitest";
import { env } from "../../src/lib/env.js";
import { ownerDb } from "../support/db.js";
import {
  cleanupRunFixtures,
  createOrg,
  createPendingMembership,
  createUser,
} from "../support/fixtures.js";
import {
  agent,
  loginAgent,
  mintToken,
} from "../support/http.js";

describe("BOLA", () => {
  afterAll(async () => {
    await cleanupRunFixtures();
  });

  it("rejects switch-org to a foreign org and leaves session activeOrg unchanged", async () => {
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

  it("rejects switch-org to a garbage org id", async () => {
    const org = await createOrg();
    const user = await createUser({
      orgs: [{ org, role: OrgRole.ORG_ADMIN }],
    });
    const client = await loginAgent(user.email);

    await client
      .post("/auth/switch-org")
      .set("Content-Type", "application/json")
      .send({ orgId: "non-existent-org-id" })
      .expect(403);
  });

  it("rejects switch-org for pending membership", async () => {
    const orgA = await createOrg("Org A");
    const orgB = await createOrg("Org B");
    const user = await createUser({
      orgs: [{ org: orgA, role: OrgRole.ORG_ADMIN }],
    });

    await createPendingMembership({
      userId: user.id,
      orgId: orgB.id,
      role: OrgRole.REVIEWER,
    });

    const client = await loginAgent(user.email);

    await client
      .post("/auth/switch-org")
      .set("Content-Type", "application/json")
      .send({ orgId: orgB.id })
      .expect(403);
  });

  it("prefers session activeOrgId over forged JWT claims", async () => {
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

    const res = await agent()
      .get("/rbac/org")
      .set("Cookie", `${env.accessCookieName}=${forged}`)
      .expect(200);

    expect(res.body.orgId).toBe(orgA.id);
    expect(res.body.role).toBe(OrgRole.ORG_ADMIN);
  });

  it("rejects access token whose sid belongs to another user", async () => {
    const org = await createOrg();
    const alice = await createUser({
      orgs: [{ org, role: OrgRole.ORG_ADMIN }],
    });
    const bob = await createUser({
      orgs: [{ org, role: OrgRole.SUPPORT_AGENT }],
    });

    const aliceClient = await loginAgent(alice.email);
    const aliceSession = await ownerDb.session.findFirstOrThrow({
      where: { userId: alice.id, revokedAt: null },
      orderBy: { createdAt: "desc" },
    });

    const hijacked = await mintToken({
      sub: bob.id,
      sid: aliceSession.id,
      activeOrgId: org.id,
      role: OrgRole.ORG_ADMIN,
      isPlatformAdmin: false,
    });

    await agent()
      .get("/rbac/org")
      .set("Cookie", `${env.accessCookieName}=${hijacked}`)
      .expect(401);
  });

  it("ignores orgId in query and body on org-scoped routes", async () => {
    const orgA = await createOrg("Org A");
    const orgB = await createOrg("Org B");
    const user = await createUser({
      orgs: [{ org: orgA, role: OrgRole.ORG_ADMIN }],
    });

    const client = await loginAgent(user.email);

    const orgProbe = await client
      .get(`/rbac/org?orgId=${orgB.id}`)
      .expect(200);
    expect(orgProbe.body.orgId).toBe(orgA.id);

    const adminProbe = await client
      .get(`/rbac/admin?orgId=${orgB.id}`)
      .expect(200);
    expect(adminProbe.body.probe).toBe("admin");
  });

  it("drops active org when membership is revoked mid-session", async () => {
    const org = await createOrg();
    const user = await createUser({
      orgs: [{ org, role: OrgRole.ORG_ADMIN }],
    });

    const client = await loginAgent(user.email);

    await ownerDb.orgMembership.delete({
      where: {
        userId_orgId: { userId: user.id, orgId: org.id },
      },
    });

    await client.get("/rbac/org").expect(403).expect((res) => {
      expect(res.body.code).toBe("no_active_org");
    });

    const me = await client.get("/auth/me").expect(200);
    expect(me.body.activeOrg).toBeNull();
  });

  it("rejects stale admin role after downgrade in database", async () => {
    const org = await createOrg();
    const user = await createUser({
      orgs: [{ org, role: OrgRole.ORG_ADMIN }],
    });

    const client = await loginAgent(user.email);

    await ownerDb.orgMembership.update({
      where: {
        userId_orgId: { userId: user.id, orgId: org.id },
      },
      data: { role: OrgRole.SUPPORT_AGENT },
    });

    await client.get("/rbac/admin").expect(403).expect((res) => {
      expect(res.body.code).toBe("insufficient_role");
    });
  });

  it("reflects role in switched org, not previous org", async () => {
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

    const orgProbe = await client.get("/rbac/org").expect(200);
    expect(orgProbe.body.orgId).toBe(orgB.id);
    expect(orgProbe.body.role).toBe(OrgRole.REVIEWER);

    await client.get("/rbac/reviewer").expect(200);
    await client.get("/rbac/admin").expect(403);
  });
});
