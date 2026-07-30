import { beforeEach } from "vitest";

process.env.AUTH_RATE_LIMIT_MAX ??= "1000";

import { resetRateLimitBucketsForTests } from "../src/routes/identity/auth/rateLimit.js";

beforeEach(() => {
  resetRateLimitBucketsForTests();
});
