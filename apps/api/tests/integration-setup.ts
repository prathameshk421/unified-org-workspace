import { afterAll, beforeAll, beforeEach } from "vitest";

process.env.AUTH_RATE_LIMIT_MAX ??= "1000";

import { resetRateLimitBucketsForTests } from "../src/routes/identity/auth/rateLimit.js";
import { closeTestServer, ensureTestServer } from "./support/test-server.js";

beforeAll(async () => {
  await ensureTestServer();
});

afterAll(async () => {
  await closeTestServer();
});

beforeEach(() => {
  resetRateLimitBucketsForTests();
});
