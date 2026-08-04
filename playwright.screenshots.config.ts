import { defineConfig } from "@playwright/test";

/**
 * Runs the README screen reference capture. It is a separate config so the
 * end-to-end suite never picks it up and rewrites committed images.
 */
export default defineConfig({
  testDir: "./test/screenshots",
  testMatch: "**/*.capture.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: "list",
});
