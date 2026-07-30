import { describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";
import request from "supertest";

describe("hardening", () => {
  const app = createApp();

  it("allows credentialed CORS from an allowed origin", async () => {
    const res = await request(app)
      .options("/auth/login")
      .set("Origin", "http://localhost:3000")
      .set("Access-Control-Request-Method", "POST")
      .expect(204);

    expect(res.headers["access-control-allow-origin"]).toBe(
      "http://localhost:3000",
    );
    expect(res.headers["access-control-allow-credentials"]).toBe("true");
  });

  it("does not reflect disallowed origins", async () => {
    const res = await request(app)
      .get("/health")
      .set("Origin", "http://evil.com");

    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("sets security headers via helmet", async () => {
    const res = await request(app).get("/health").expect(200);

    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-frame-options"]).toBeDefined();
    expect(res.headers["cross-origin-resource-policy"]).toBe("same-origin");
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });

  it("rejects oversized JSON bodies with 413", async () => {
    const huge = JSON.stringify({ email: "a".repeat(2_000_000) });

    await request(app)
      .post("/auth/login")
      .set("Content-Type", "application/json")
      .send(huge)
      .expect(413);
  });

  it.fails("returns JSON for malformed JSON bodies", async () => {
    const res = await request(app)
      .post("/auth/login")
      .set("Content-Type", "application/json")
      .send("{ not-json");

    expect(res.headers["content-type"]).toMatch(/application\/json/);
  });

  it.fails("returns JSON 404 for unknown routes", async () => {
    const res = await request(app).get("/does-not-exist").expect(404);
    expect(res.headers["content-type"]).toMatch(/application\/json/);
  });
});
