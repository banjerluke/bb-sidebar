import { describe, expect, it } from "vitest";
import type { PluginSidebarThread } from "@get-bb/plugin-sdk";
import { idleSidebarThreadFields } from "./test-fixtures";
import {
  layoutActiveThreadsByProject,
  sortActiveThreads,
  visibleShelfThreads,
  activeRepresentativeThreadId,
} from "./inbox-layout";

function thread(overrides: Partial<PluginSidebarThread> = {}): PluginSidebarThread {
  return {
    ...idleSidebarThreadFields,
    id: "thr_1",
    projectId: "proj_1",
    title: "A thread",
    titleFallback: null,
    parentThreadId: null,
    sectionId: null,
    originKind: null,
    originPluginId: null,
    providerId: "codex",
    hasPendingInteraction: false,
    activity: {
      workflows: 0,
      backgroundAgents: 0,
      backgroundCommands: 0,
      planMode: 0,
      goals: 0,
    },
    indicator: "none",
    indicatorLabel: null,
    isUnread: false,
    isPinned: false,
    isArchived: false,
    environment: null,
    host: null,
    createdAt: 100,
    updatedAt: 100,
    lastReadAt: 100,
    latestAttentionAt: 100,
    ...overrides,
  };
}

describe("layoutActiveThreadsByProject", () => {
  it("groups repeated projects at their first slot while preserving member order", () => {
    const a = thread({ id: "a", projectId: "p" });
    const b = thread({ id: "b", projectId: "q" });
    const c = thread({ id: "c", projectId: "p" });
    expect(layoutActiveThreadsByProject([a, b, c])).toEqual([
      { kind: "group", key: "project:p", projectId: "p", threads: [a, c] },
      { kind: "thread", key: "b", thread: b },
    ]);
  });
  it("keeps singleton projects as ordinary rows", () => {
    const a = thread({ id: "a" });
    expect(layoutActiveThreadsByProject([a])).toEqual([{ kind: "thread", key: "a", thread: a }]);
    expect(layoutActiveThreadsByProject([])).toEqual([]);
  });
});
describe("sortActiveThreads", () => {
  const rows = [
    thread({ id: "a", createdAt: 3, updatedAt: 1 }),
    thread({ id: "b", createdAt: 2, updatedAt: 4 }),
    thread({ id: "c", createdAt: 1, updatedAt: 4 }),
  ];
  it("sorts activity ties by creation time without mutating the input", () => {
    expect(sortActiveThreads(rows, "activity").map((row) => row.id)).toEqual(["b", "c", "a"]);
    expect(rows.map((row) => row.id)).toEqual(["a", "b", "c"]);
  });
  it("sorts creation ties by activity", () => {
    const tied = [...rows, thread({ id: "d", createdAt: 3, updatedAt: 5 })];
    expect(sortActiveThreads(tied, "created").map((row) => row.id)).toEqual(["d", "a", "b", "c"]);
  });
  it.each(["manual", "project"] as const)("copies %s order unchanged", (mode) => {
    const result = sortActiveThreads(rows, mode);
    expect(result).toEqual(rows);
    expect(result).not.toBe(rows);
  });
});
describe("visibleShelfThreads", () => {
  const rows = [thread({ id: "a" }), thread({ id: "b" }), thread({ id: "c" })];
  it("retains active and attention paths in a collapsed shelf", () => {
    expect(visibleShelfThreads(rows, false, "c", 0, new Set(["a"]))).toEqual([rows[0], rows[2]]);
  });
  it("retains the active row beyond an expanded shelf's page limit", () => {
    expect(visibleShelfThreads(rows, true, "c", 1)).toEqual([rows[0], rows[2]]);
  });
  it("shows all expanded rows by default and none collapsed without paths", () => {
    expect(visibleShelfThreads(rows, true, null)).toEqual(rows);
    expect(visibleShelfThreads(rows, false, null)).toEqual([]);
  });
});
describe("activeRepresentativeThreadId", () => {
  const parent = thread({ id: "parent" });
  const child = thread({ id: "child", parentThreadId: "parent" });
  const grandchild = thread({ id: "grandchild", parentThreadId: "child" });
  it("finds the closest ancestor represented by a flat row", () => {
    expect(activeRepresentativeThreadId([parent, child, grandchild], "grandchild", [parent])).toBe("parent");
    expect(activeRepresentativeThreadId([parent, child, grandchild], "grandchild", [parent, child])).toBe("child");
    expect(activeRepresentativeThreadId([parent, child], "child", [child])).toBe("child");
  });
  it("returns null for missing, archived, or unrepresented paths", () => {
    expect(activeRepresentativeThreadId([child], "child", [parent])).toBeNull();
    expect(activeRepresentativeThreadId([parent], null, [parent])).toBeNull();
    expect(activeRepresentativeThreadId([parent], "missing", [parent])).toBeNull();
    expect(activeRepresentativeThreadId([{ ...parent, isArchived: true }], "parent", [parent])).toBeNull();
  });
  it("terminates cyclic ancestry", () => {
    const cycle = [{ ...parent, parentThreadId: "child" }, child];
    expect(activeRepresentativeThreadId(cycle, "child", [])).toBeNull();
  });
});
