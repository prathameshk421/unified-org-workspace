import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/integration/**/*.test.ts"],
    globalSetup: ["./tests/global-setup.ts"],
    setupFiles: ["./tests/setup-env.ts", "./tests/integration-setup.ts"],
    environment: "node",
    pool: "forks",
    fileParallelism: false,
    testTimeout: 30_000,
    retry: 0,
    reporters: process.env.CI
      ? ["default", ["junit", { outputFile: "test-results/integration.junit.xml" }]]
      : ["default"],
  },
});
