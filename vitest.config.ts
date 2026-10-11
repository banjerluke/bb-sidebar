import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    silent: "passed-only",
    testTimeout: 30_000,
    name: "bb-plugin-bb-sidebar",
    include: ["**/*.test.{ts,tsx}"],
    exclude: ["node_modules/**"],
    setupFiles: ["./src/test-setup.ts"],
  },
});
