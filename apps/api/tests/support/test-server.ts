import http from "node:http";
import type { Express } from "express";
import { createApp } from "../../src/app.js";

let app: Express | null = null;
let server: http.Server | null = null;
let startPromise: Promise<http.Server> | null = null;

/**
 * Supertest against a bare Express app races `listen()` per request and can
 * intermittently fail with `read ECONNRESET` in large suites (Node 20+).
 * Bind once to 127.0.0.1 and reuse the listening server.
 */
export async function ensureTestServer(): Promise<http.Server> {
  if (server?.listening) {
    return server;
  }

  if (!startPromise) {
    startPromise = new Promise<http.Server>((resolve, reject) => {
      app = createApp();
      const next = http.createServer(app);
      next.once("error", (error) => {
        startPromise = null;
        reject(error);
      });
      next.listen(0, "127.0.0.1", () => {
        server = next;
        resolve(next);
      });
    });
  }

  return startPromise;
}

export function getTestServer(): http.Server {
  if (!server?.listening) {
    throw new Error(
      "Integration test server is not listening — ensureTestServer() must run in setup",
    );
  }
  return server;
}

export async function closeTestServer(): Promise<void> {
  const current = server;
  server = null;
  app = null;
  startPromise = null;

  if (!current) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    current.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}
