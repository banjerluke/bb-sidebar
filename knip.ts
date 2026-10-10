import type { KnipConfig } from "knip";

// The SDK loads these peer dependencies even without direct source imports.
export const sdkPeerDependencies = ["hono", "cron-parser", "better-sqlite3"];

const config: KnipConfig = {
  entry: ["app.tsx", "src/server.ts", "src/ports-host.ts", "src/test-setup.ts"],
  project: ["app.tsx", "src/**/*.{ts,tsx}", "scripts/**/*.mjs"],
  ignoreDependencies: [
    ...sdkPeerDependencies,
    // Existing unused dependencies: SB-8 will prune these. Do not add new debt here.
    "@pierre/diffs",
    "@radix-ui/react-alert-dialog",
    "@radix-ui/react-dropdown-menu",
    "@radix-ui/react-hover-card",
    "@radix-ui/react-menubar",
    "@radix-ui/react-navigation-menu",
    "class-variance-authority",
    "vaul",
  ],
  // npm's typescript -> @typescript/typescript6 alias provides tsc; Knip misses that binary.
  ignoreBinaries: ["tsc"],
  // Existing unused exports/types are deferred; knip:report shows them and the SB-8 deps.
  ignoreIssues: { "src/**": ["exports", "types"] },
};

export default config;
