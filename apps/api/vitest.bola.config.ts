import { defineConfig } from "vitest/config";

/**
 * Product BOLA security gate — exact allowlist (Branch 11 lock).
 * FORBIDDEN: shipping with only product-bola/**.
 * Sync this list when adding domain suites that harden isolation.
 */
const BOLA_INCLUDE = [
  "tests/integration/bola.test.ts",
  "tests/integration/auth-flow.test.ts",
  "tests/integration/token-lifecycle.test.ts",
  "tests/integration/rbac.test.ts",
  "tests/integration/hardening.test.ts",
  "tests/integration/tickets.test.ts",
  "tests/integration/ticket-comments.test.ts",
  "tests/integration/ticket-attachments.test.ts",
  "tests/integration/ticket-rbac-matrix.test.ts",
  "tests/integration/ticket-share-bola-matrix.test.ts",
  "tests/integration/prs-isolation.test.ts",
  "tests/integration/prs-approval.test.ts",
  "tests/integration/pr-comments.test.ts",
  "tests/integration/item-shares-tickets.test.ts",
  "tests/integration/item-shares-prs.test.ts",
  "tests/integration/org-connections.test.ts",
  "tests/integration/org-settings.test.ts",
  "tests/integration/audit.test.ts",
  "tests/integration/audit-viewer.test.ts",
  "tests/integration/ai-digest-leak.test.ts",
  "tests/integration/product-bola/**/*.test.ts",
] as const;

if (BOLA_INCLUDE.length === 0) {
  throw new Error("vitest.bola.config.ts allowlist must not be empty");
}

export default defineConfig({
  test: {
    include: [...BOLA_INCLUDE],
    globalSetup: ["./tests/global-setup.ts"],
    setupFiles: ["./tests/setup-env.ts", "./tests/integration-setup.ts"],
    environment: "node",
    pool: "forks",
    fileParallelism: false,
    testTimeout: 30_000,
    retry: 0,
    reporters: process.env.CI
      ? ["default", ["junit", { outputFile: "test-results/bola.junit.xml" }]]
      : ["default"],
  },
});
