import { AuditAction } from "@unified/types";
import { OrgRole } from "@unified/types";
import { afterAll, describe, expect, it } from "vitest";
import {
  cleanupRunFixtures,
  createOrg,
  createRunTaggedEmail,
  createUser,
  trackApiRegisteredUser,
} from "../support/fixtures.js";
import { agent, loginAgent, parseSetCookie, waitForAudit } from "../support/http.js";

describe("auth flow", () => {
  afterAll(async () => {
    await cleanupRunFixtures();
  });

  it("registers a user and sets HttpOnly cookies", async () => {
    const email = createRunTaggedEmail("register");
    const client = agent();

    const res = await client
      .post("/auth/register")
      .set("Content-Type", "application/json")
      .send({
        email,
        password: "password123",
        name: "Register User",
      })
      .expect(201);

    trackApiRegisteredUser(res.body.user);
    expect(res.body.user.email).toBe(email);
    const cookies = parseSetCookie(res);
    expect(cookies.unified_access?.httpOnly).toBe(true);
    expect(cookies.unified_refresh?.httpOnly).toBe(true);

    const me = await client.get("/auth/me").expect(200);
    expect(me.body.user.email).toBe(email);
    expect(me.body.activeOrg).toBeNull();
  });

  it("rejects duplicate email with 409", async () => {
    const user = await createUser();

    await agent()
      .post("/auth/register")
      .set("Content-Type", "application/json")
      .send({
        email: user.email,
        password: "password123",
        name: "Duplicate",
      })
      .expect(409);
  });

  it("validates password length", async () => {
    const res = await agent()
      .post("/auth/register")
      .set("Content-Type", "application/json")
      .send({
        email: `short-${crypto.randomUUID().slice(0, 8)}@vtest.local`,
        password: "short",
        name: "Short Password",
      })
      .expect(400);

    expect(res.body.details.password).toBeDefined();
  });

  it("rejects non-JSON login with 415", async () => {
    await agent()
      .post("/auth/login")
      .set("Content-Type", "text/plain")
      .send("not-json")
      .expect(415);
  });

  it("returns login shape with activeOrg", async () => {
    const org = await createOrg();
    const user = await createUser({
      orgs: [{ org, role: OrgRole.ORG_ADMIN }],
    });

    const res = await agent()
      .post("/auth/login")
      .set("Content-Type", "application/json")
      .send({ email: user.email, password: "password123" })
      .expect(200);

    expect(res.body.user.isPlatformAdmin).toBe(false);
    expect(res.body.activeOrg).toEqual({
      orgId: org.id,
      role: OrgRole.ORG_ADMIN,
    });
  });

  it("returns activeOrg null for membership-less user", async () => {
    const user = await createUser({ isPlatformAdmin: true });

    const res = await agent()
      .post("/auth/login")
      .set("Content-Type", "application/json")
      .send({ email: user.email, password: "password123" })
      .expect(200);

    expect(res.body.activeOrg).toBeNull();
  });

  it("returns /auth/me with Cache-Control no-store", async () => {
    const org = await createOrg();
    const user = await createUser({
      orgs: [{ org, role: OrgRole.SUPPORT_AGENT }],
    });

    const client = await loginAgent(user.email);

    const res = await client.get("/auth/me").expect(200);
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(res.body.user.email).toBe(user.email);
    expect(res.body.memberships).toHaveLength(1);
  });

  it("does not leak whether an email exists", async () => {
    const known = await createUser();
    const wrongPassword = await agent()
      .post("/auth/login")
      .set("Content-Type", "application/json")
      .send({ email: known.email, password: "wrong-password" })
      .expect(401);

    const unknown = await agent()
      .post("/auth/login")
      .set("Content-Type", "application/json")
      .send({ email: `missing-${crypto.randomUUID()}@vtest.local`, password: "password123" })
      .expect(401);

    expect(wrongPassword.body).toEqual(unknown.body);
    expect(wrongPassword.status).toBe(unknown.status);
  });

  it("writes auth.login audit row", async () => {
    const org = await createOrg();
    const user = await createUser({
      orgs: [{ org, role: OrgRole.ORG_ADMIN }],
    });

    const auditSince = new Date();
    await loginAgent(user.email);

    await waitForAudit(
      (row) =>
        row.action === AuditAction.AUTH_LOGIN && row.userId === user.id && row.orgId === org.id,
      auditSince,
    );
  });
});
