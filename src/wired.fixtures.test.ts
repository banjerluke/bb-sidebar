// @vitest-environment jsdom
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";
import { createWired } from "./test-wired";
import { deferred, loadInboxApp, thread } from "./test-inbox";

vi.mock("sonner", async () => (await import("./test-inbox")).sonnerMock());
await loadInboxApp();

// Future schema changes add a new fixture version; never edit an old one.
const database = join(process.cwd(), "src/fixtures/sidebar-v0.2.34.sqlite");
const storage = join(process.cwd(), "src/fixtures/local-storage-v0.2.34.json");
const expectedSettings = {
  snoozePresets: "1h, 4h, 2d",
  inactiveThreadsEnabled: false,
  inactiveAfterHours: 12,
  showRunningChildrenWhenCollapsed: false,
  autoSettleInactive: false,
  autoSettleAfterDays: 7,
  autoSettleOnMerge: false,
  childSortField: "activity",
  childSortDirection: "descending",
  childIconStyle: "provider",
  compactWorkingThreads: true,
  workingShelf: true,
  dockShelves: true,
  projectColorsEnabled: true,
  projectColorDisplay: "full",
};
const expectedRows = [
  {
    threadId: "parked",
    parkedAt: 1_799_999_000_000,
    settledAt: null,
    settledOverride: null,
    snoozedUntil: null,
    snoozedAt: null,
  },
  {
    threadId: "snoozed",
    parkedAt: null,
    settledAt: null,
    settledOverride: null,
    snoozedUntil: 1_800_003_600_000,
    snoozedAt: 1_800_000_000_000,
  },
  {
    threadId: "settled",
    parkedAt: null,
    settledAt: 1_799_999_000_000,
    settledOverride: "settled",
    snoozedUntil: null,
    snoozedAt: null,
  },
  {
    threadId: "override",
    parkedAt: null,
    settledAt: null,
    settledOverride: "active",
    snoozedUntil: null,
    snoozedAt: null,
  },
  {
    threadId: "child",
    parkedAt: null,
    settledAt: 1_799_999_000_000,
    settledOverride: "settled",
    snoozedUntil: null,
    snoozedAt: null,
  },
];

it("the committed database is byte-identical to deterministic real migrations and inserts", () => {
  const directory = mkdtempSync(join(tmpdir(), "sidebar-fixture-"));
  try {
    const generated = join(directory, "fixture.sqlite");
    execFileSync(process.execPath, ["scripts/make-fixture-db.mjs", generated]);
    const bytes = readFileSync(database);
    expect(bytes.length).toBeLessThan(100_000);
    expect(readFileSync(generated).equals(bytes)).toBe(true);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

it("opens the released database in fake host storage and preserves every setting and lifecycle field", async () => {
  const wired = await createWired([], { fixture: database });
  expect(await wired.call("getSidebarSettings")).toEqual(expectedSettings);
  expect(await wired.call("listLifecycle")).toEqual({ rows: expectedRows });
  expect(await wired.call("listInboxOrder")).toEqual({ inboxThreadIds: ["second", "first"] });
  expect(await wired.call("getProjectColors")).toEqual({ colors: { proj_1: "#123456" } });
  expect(wired.db.prepare("SELECT * FROM project_icons").all()).toEqual([
    { project_id: "proj_1", path: "assets/logo.png", updated_at: 1_800_000_000_000 },
  ]);
  expect(wired.db.prepare("SELECT * FROM project_icon_uploads").get()).toEqual({
    project_id: "proj_2",
    filename: "pixel.png",
    mime_type: "image/png",
    size_bytes: 68,
    content_base64: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aS1cAAAAASUVORK5CYII=",
    updated_at: 1_800_000_000_000,
  });
  expect(wired.db.prepare("SELECT * FROM title_recovery_attempts").all()).toEqual([{ thread_id: "settled" }]);
  expect(wired.db.prepare("SELECT archived_shelf_enabled FROM sidebar_settings").get()).toEqual({
    archived_shelf_enabled: 1,
  });
});

it("reconstructs all cached shelves, manual order and settings before any RPC resolves", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(1_800_000_000_000);
  const fixture: Record<string, string> = JSON.parse(readFileSync(storage, "utf8"));
  for (const [key, value] of Object.entries(fixture)) localStorage.setItem(key, value);
  const gate = deferred<void>();
  const threads = [
    "first",
    "second",
    "parked",
    "snoozed",
    "settled",
    "override",
    "child",
    "busy",
    "expanded-child",
  ].map((id) =>
    thread({
      id,
      title: `Golden ${id}`,
      updatedAt: Date.now(),
      parentThreadId: id === "child" ? "settled" : id === "expanded-child" ? "override" : null,
      ...(id === "busy" ? { indicator: "runtime" as const, runtimeStatus: "active" as const } : {}),
    }),
  );
  const wired = await createWired(threads, { rpcGate: gate.promise });
  const inboxSlot = wired.mount();
  const settingsSlot = wired.mount("settings");
  for (const [name, id] of [
    ["Parked", "parked"],
    ["Snoozed", "snoozed"],
    ["Settled", "settled"],
    ["Working", "busy"],
  ]) {
    expect(within(screen.getByRole("region", { name })).getByText(`Golden ${id}`)).toBeDefined();
  }
  expect(screen.getByText("Golden expanded-child")).toBeDefined();
  expect(screen.getByRole("list", { name: "Child threads" })).toBeDefined();
  const active = screen.getByRole("region", { name: "Active" });
  expect(
    within(active)
      .getAllByRole("listitem")
      .filter((row) => /Golden (first|second)/.test(row.textContent ?? ""))
      .map((row) => row.textContent),
  ).toEqual([expect.stringContaining("Golden second"), expect.stringContaining("Golden first")]);
  expect(screen.getByRole("switch", { name: "Working shelf" }).getAttribute("aria-checked")).toBe("true");
  expect(screen.getByRole("switch", { name: "Dock shelves to the bottom" }).getAttribute("aria-checked")).toBe("true");
  expect(screen.getByDisplayValue("1h, 4h, 2d")).toBeDefined();
  expect(screen.getByText("Working · 5m")).toBeDefined();
  expect(screen.getByRole("combobox", { name: "Open port links on" })).toHaveProperty("value", "host_1");
  expect(Object.keys(fixture).sort()).toEqual(
    [
      "active-grouping",
      "active-sort",
      "child-expansion",
      "inbox-order-cache",
      "lifecycle-cache",
      "port-link-host",
      "project-collapse",
      "settings-cache",
      "shelf-expansion",
      "working-since",
    ]
      .map((key) => `bb-sidebar:${key}:v1`)
      .sort(),
  );
  expect(inboxSlot.inspection.rpcCalls.length).toBeGreaterThan(0);
  expect(settingsSlot.inspection.rpcCalls.length).toBeGreaterThan(0);
  // The bridge is still blocked: no server read or policy reply can replace cache state.
  expect(wired.db.prepare("SELECT COUNT(*) AS n FROM thread_lifecycle").get()).toEqual({ n: 0 });
  fireEvent.keyDown(screen.getByRole("combobox", { name: "Sort active threads: Manual order" }), { key: "Enter" });
  fireEvent.click(screen.getByRole("option", { name: "Project" }));
  const project = screen.getByRole("region", { name: "Sidebar project" });
  expect(
    within(project)
      .getByRole("button", { name: /^Sidebar/ })
      .getAttribute("aria-expanded"),
  ).toBe("false");
  expect(within(project).queryByText("Golden first")).toBeNull();
  wired.unmount(inboxSlot);
  wired.unmount(settingsSlot);
});
