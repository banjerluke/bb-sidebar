import { availableParallelism } from "node:os";
import { defineConfig } from "vitest/config";

const appTests = [
  "src/ThreadInbox.*.test.tsx",
  "src/ParentChip.test.tsx",
  "src/SubagentsChip.test.tsx",
  "src/ProjectFavicon.test.tsx",
  "src/app-worker-state.*.test.tsx",
];
const common = {
  silent: "passed-only" as const,
  testTimeout: 30_000,
  setupFiles: ["./src/test-setup.ts"],
};

export default defineConfig({
  test: {
    // Limit duplicate app boots and leave a CPU available on smaller runners.
    maxWorkers: Math.max(1, Math.min(8, availableParallelism() - 1)),
    projects: [
      {
        test: {
          ...common,
          name: "app",
          environment: "jsdom",
          include: appTests,
          isolate: false,
          setupFiles: [...common.setupFiles, "./src/test-app-setup.ts"],
        },
      },
      {
        test: {
          ...common,
          name: "isolated",
          include: ["**/*.test.{ts,tsx}"],
          exclude: ["node_modules/**", ...appTests],
        },
      },
    ],
  },
});
