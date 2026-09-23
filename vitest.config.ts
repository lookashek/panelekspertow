import path from "node:path";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  test: {
    // Scope to this project's own tests — .claude/skills/** carries its own
    // node:test suites (e.g. metadata-guard.test.mjs) that Vitest can't run.
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
