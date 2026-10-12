import type { KnipConfig } from "knip";

// The SDK loads these peer dependencies even without direct source imports.
export const sdkPeerDependencies = ["hono", "cron-parser", "better-sqlite3"];

const config: KnipConfig = {
  entry: [
    "app.tsx",
    "src/server.ts",
    "src/ports-host.ts",
    "src/test-setup.ts",
    "e2e/*.spec.mjs",
    "e2e/playwright.config.mjs",
  ],
  project: ["app.tsx", "src/**/*.{ts,tsx}", "scripts/**/*.mjs", "e2e/**/*.mjs"],
  ignoreDependencies: sdkPeerDependencies,
  // npm's typescript -> @typescript/typescript6 alias provides tsc; Knip misses that binary.
  ignoreBinaries: ["tsc"],
  // Existing export/type debt: Knip supports file/issue-type ignores, not individual names.
  // Keep names documented here; knip:report exposes all debt for pruning.
  ignoreIssues: {
    // childNeedsAttention
    "src/ChildThreadList.tsx": ["exports"],
    // DEFAULT_AUTO_SETTLE_AFTER_DAYS, AutoSettleSettings, AutoSettleDecision
    "src/auto-settle.ts": ["exports", "types"],
    // titlePrompt, TitleGenerationOptions
    "src/regenerate-title.ts": ["exports", "types"],
    // CHILD_STATUS_KINDS, childStatusCount, ChildStatusSummary
    "src/child-status.ts": ["exports", "types"],
    // shortStatus, ShortStatus
    "src/StatusSlot.tsx": ["exports", "types"],
    // PROJECT_ICON_ROUTE
    "src/project-icons.ts": ["exports"],
    // WORKING_SINCE_STORAGE_KEY
    "src/working-since.ts": ["exports"],
    // hashHue
    "src/Disc.tsx": ["exports"],
    // hasStatusGlyph
    "src/StatusGlyph.tsx": ["exports"],
    // PORT_LINK_HOST_KEY
    "src/PortLinkSettings.tsx": ["exports"],
    // settingsSectionId
    "src/settings-ui.tsx": ["exports"],
    // SelectValue
    "src/components/Select.tsx": ["exports"],
    // isWorking
    "src/useLifecycle.ts": ["exports"],
    // WakeReason
    "src/lifecycle.ts": ["types"],
    // InactiveThread
    "src/inactive.ts": ["types"],
    // ProjectScope
    "src/inbox.ts": ["types"],
    // DropPlacement
    "src/pinned-order.ts": ["types"],
    // Listener, DockerRow
    "src/port-scan.ts": ["types"],
    // DisplayPullRequest
    "src/pull-request-display.ts": ["types"],
    // TerminalReclaimPlan
    "src/reclaim.ts": ["types"],
    // PortThread
    "src/thread-ports.ts": ["types"],
    // ThreadTaskFailure, ThreadTaskResult
    "src/thread-tasks.ts": ["types"],
    // ChildThreadDisplay
    "src/ChildThreadDisplay.tsx": ["types"],
    // PinnedReorderApi
    "src/usePinnedReorder.ts": ["types"],
    // InboxReorderApi
    "src/useInboxReorder.ts": ["types"],
  },
};

export default config;
