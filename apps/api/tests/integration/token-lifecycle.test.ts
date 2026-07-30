import { createHash } from "node:crypto";
import { OrgRole } from "@unified/types";
import { afterAll, describe, expect, it } from "vitest";
import { env } from "../../src/lib/env.js";
import { ownerDb } from "../support/db.js";
import { cleanupRunFixtures, createOrg, createUser } from "../support/fixtures.js";
import { agent, loginAgent, mintToken, parseSetCookie } from "../support/http.js";

describe("token lifecycle", () => {
  afterAll(async () => {
    await cleanupRunFixtures();
  });

  it("rotates refresh tokens on refresh", async () => {
    const org = await createOrg();
    const user = await createUser({
      orgs: [{ org, role: OrgRole.ORG_ADMIN }],
    });

    const loginRes = await agent()
      .post("/auth/login")
      .set("Content-Type", "application/json")
      .send({ email: user.email, password: "password123" })
      .expect(200);

    const firstRefresh = parseSetCookie(loginRes).unified_refresh?.value;
    expect(firstRefresh).toBeTruthy();

    const refreshRes = await agent()
      .post("/auth/refresh")
      .set("Cookie", [
        `${env.refreshCookieName}=${firstRefresh}`,
        `${env.accessCookieName}=${parseSetCookie(loginRes).unified_access?.value}`,
      ])
      .set("Content-Type", "application/json")
      .send({})
      .expect(200);

    const secondRefresh = parseSetCookie(refreshRes).unified_refresh?.value;
    expect(secondRefresh).toBeTruthy();
    expect(secondRefresh).not.toBe(firstRefresh);

    const oldToken = await ownerDb.refreshToken.findFirst({
      where: { tokenHash: hash(firstRefresh!) },
    });
    expect(oldToken?.revokedAt).not.toBeNull();
  });

  it("detects refresh token reuse and revokes the session chain", async () => {
    const org = await createOrg();
    const user = await createUser({
      orgs: [{ org, role: OrgRole.ORG_ADMIN }],
    });

    const loginRes = await agent()
      .post("/auth/login")
      .set("Content-Type", "application/json")
      .send({ email: user.email, password: "password123" })
      .expect(200);

    const oldRefresh = parseSetCookie(loginRes).unified_refresh?.value;
    const oldAccess = parseSetCookie(loginRes).unified_access?.value;
    expect(oldRefresh).toBeTruthy();
    expect(oldAccess).toBeTruthy();

    const rotated = await agent()
      .post("/auth/refresh")
      .set("Cookie", [
        `${env.refreshCookieName}=${oldRefresh}`,
        `${env.accessCookieName}=${oldAccess}`,
      ])
      .set("Content-Type", "application/json")
      .send({})
      .expect(200);

    const newRefresh = parseSetCookie(rotated).unified_refresh?.value;
    expect(newRefresh).toBeTruthy();

    const reuse = await agent()
      .post("/auth/refresh")
      .set("Cookie", [
        `${env.refreshCookieName}=${oldRefresh}`,
        `${env.accessCookieName}=${parseSetCookie(rotated).unified_access?.value}`,
      ])
      .set("Content-Type", "application/json")
      .send({})
      .expect(401);

    expect(reuse.body.code).toBe("token_reuse");
    const cleared = parseSetCookie(reuse);
    expect(
      cleared.unified_access?.maxAge === 0 || cleared.unified_access?.expires !== undefined,
    ).toBe(true);
    expect(
      cleared.unified_refresh?.maxAge === 0 || cleared.unified_refresh?.expires !== undefined,
    ).toBe(true);

    const session = await ownerDb.session.findFirstOrThrow({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
    });
    expect(session.revokedAt).not.toBeNull();

    const tokens = await ownerDb.refreshToken.findMany({
      where: { sessionId: session.id },
    });
    expect(tokens.every((token) => token.revokedAt !== null)).toBe(true);

    await agent()
      .post("/auth/refresh")
      .set("Cookie", [`${env.refreshCookieName}=${newRefresh}`])
      .set("Content-Type", "application/json")
      .send({})
      .expect(401);
  });

  it("revokes access and refresh cookies on logout", async () => {
    const org = await createOrg();
    const user = await createUser({
      orgs: [{ org, role: OrgRole.ORG_ADMIN }],
    });

    const client = await loginAgent(user.email);
    await client.post("/auth/logout").set("Content-Type", "application/json").send({}).expect(200);

    await client.get("/auth/me").expect(401);
    await client.post("/auth/refresh").set("Content-Type", "application/json").send({}).expect(401);
  });

  it("logout-everywhere revokes all active sessions", async () => {
    const org = await createOrg();
    const user = await createUser({
      orgs: [{ org, role: OrgRole.ORG_ADMIN }],
    });

    const a = await loginAgent(user.email);
    const b = await loginAgent(user.email);
    const c = await loginAgent(user.email);

    await a
      .post("/auth/logout-everywhere")
      .set("Content-Type", "application/json")
      .send({})
      .expect(200);

    await a.get("/auth/me").expect(401);
    await b.get("/auth/me").expect(401);
    await c.get("/auth/me").expect(401);

    const sessions = await ownerDb.session.findMany({
      where: { userId: user.id },
    });
    expect(sessions.every((session) => session.revokedAt !== null)).toBe(true);
  });

  it("rejects expired access tokens", async () => {
    const org = await createOrg();
    const user = await createUser({
      orgs: [{ org, role: OrgRole.ORG_ADMIN }],
    });

    await loginAgent(user.email);
    const session = await ownerDb.session.findFirstOrThrow({
      where: { userId: user.id, revokedAt: null },
      orderBy: { createdAt: "desc" },
    });

    const expired = await mintToken(
      {
        sub: user.id,
        sid: session.id,
        activeOrgId: org.id,
        role: OrgRole.ORG_ADMIN,
      },
      { expiresIn: "-1s" },
    );

    await agent().get("/auth/me").set("Cookie", `${env.accessCookieName}=${expired}`).expect(401);
  });

  it("rejects revoked sessions even with valid JWT", async () => {
    const org = await createOrg();
    const user = await createUser({
      orgs: [{ org, role: OrgRole.ORG_ADMIN }],
    });

    const loginRes = await agent()
      .post("/auth/login")
      .set("Content-Type", "application/json")
      .send({ email: user.email, password: "password123" })
      .expect(200);

    const access = parseSetCookie(loginRes).unified_access?.value;
    expect(access).toBeTruthy();

    await ownerDb.session.updateMany({
      where: { userId: user.id },
      data: { revokedAt: new Date() },
    });

    await agent()
      .get("/auth/me")
      .set("Cookie", `${env.accessCookieName}=${access}`)
      .expect(401)
      .expect((res) => {
        expect(res.body.error).toBe("Session expired");
      });
  });

  it("rejects expired refresh tokens", async () => {
    const org = await createOrg();
    const user = await createUser({
      orgs: [{ org, role: OrgRole.ORG_ADMIN }],
    });

    const loginRes = await agent()
      .post("/auth/login")
      .set("Content-Type", "application/json")
      .send({ email: user.email, password: "password123" })
      .expect(200);

    const refresh = parseSetCookie(loginRes).unified_refresh?.value;
    expect(refresh).toBeTruthy();

    await ownerDb.refreshToken.updateMany({
      where: { session: { userId: user.id } },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });

    await agent()
      .post("/auth/refresh")
      .set("Cookie", [`${env.refreshCookieName}=${refresh}`])
      .set("Content-Type", "application/json")
      .send({})
      .expect(401);
  });

  it("requires refresh cookie", async () => {
    await agent()
      .post("/auth/refresh")
      .set("Content-Type", "application/json")
      .send({})
      .expect(401)
      .expect((res) => {
        expect(res.body.error).toBe("Refresh token required");
      });
  });

  it("does not poison a victim session with an unknown refresh token", async () => {
    const org = await createOrg();
    const victim = await createUser({
      orgs: [{ org, role: OrgRole.ORG_ADMIN }],
    });

    const victimClient = await loginAgent(victim.email);

    await agent()
      .post("/auth/refresh")
      .set("Cookie", [`${env.refreshCookieName}=totally-unknown-token`])
      .set("Content-Type", "application/json")
      .send({})
      .expect(401);

    await victimClient.get("/auth/me").expect(200);
  });

  it("handles parallel refresh without 5xx", async () => {
    const org = await createOrg();
    const user = await createUser({
      orgs: [{ org, role: OrgRole.ORG_ADMIN }],
    });

    const loginRes = await agent()
      .post("/auth/login")
      .set("Content-Type", "application/json")
      .send({ email: user.email, password: "password123" })
      .expect(200);

    const refresh = parseSetCookie(loginRes).unified_refresh?.value;
    const access = parseSetCookie(loginRes).unified_access?.value;
    expect(refresh).toBeTruthy();
    expect(access).toBeTruthy();
    const cookie = [`${env.refreshCookieName}=${refresh}`, `${env.accessCookieName}=${access}`];

    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        agent()
          .post("/auth/refresh")
          .set("Cookie", cookie)
          .set("Content-Type", "application/json")
          .send({}),
      ),
    );

    expect(results.every((res) => res.status < 500)).toBe(true);
    expect(results.some((res) => res.status === 200)).toBe(true);
  });

  it("switch-org rotates access cookie only", async () => {
    const orgA = await createOrg("Org A");
    const orgB = await createOrg("Org B");
    const user = await createUser({
      orgs: [
        { org: orgA, role: OrgRole.ORG_ADMIN },
        { org: orgB, role: OrgRole.REVIEWER },
      ],
    });

    const client = await loginAgent(user.email);
    const loginAccess = (await client.get("/auth/me").expect(200)).headers["set-cookie"];

    const switchRes = await client
      .post("/auth/switch-org")
      .set("Content-Type", "application/json")
      .send({ orgId: orgB.id })
      .expect(200);

    const accessAfter = parseSetCookie(switchRes).unified_access?.value;
    expect(accessAfter).toBeTruthy();
    expect(parseSetCookie(switchRes).unified_refresh).toBeUndefined();
    void loginAccess;

    await client.post("/auth/refresh").set("Content-Type", "application/json").send({}).expect(200);
  });

  it("syncs active org across sessions after switch-org", async () => {
    const orgA = await createOrg("Org A");
    const orgB = await createOrg("Org B");
    const user = await createUser({
      orgs: [
        { org: orgA, role: OrgRole.ORG_ADMIN },
        { org: orgB, role: OrgRole.REVIEWER },
      ],
    });

    const first = await loginAgent(user.email);
    const second = await loginAgent(user.email);

    await first
      .post("/auth/switch-org")
      .set("Content-Type", "application/json")
      .send({ orgId: orgB.id })
      .expect(200);

    const me = await second.get("/auth/me").expect(200);
    expect(me.body.activeOrg.orgId).toBe(orgB.id);
    expect(me.body.activeOrg.role).toBe(OrgRole.REVIEWER);
  });
});

function hash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
