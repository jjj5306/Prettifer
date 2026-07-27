import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    setupFiles: ["./test/setup.ts"],
    coverage: {
      reporter: ["text", "html"],
    },
    include: ["test/**/*.test.{ts,tsx}"],
    hookTimeout: 30_000,
    testTimeout: 30_000,
  },
});
