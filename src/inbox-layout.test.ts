import { describe, expect, it } from "vitest";
import type { PluginSidebarThread } from "@get-bb/plugin-sdk";
import { idleSidebarThreadFields } from "./test-fixtures";
import {
  projectOrderUnits,
  expandProjectUnits,
  isActiveGrouping,
  isActiveOrder,
  sameOrder,
  projectUnitKey,
  type ProjectUnit,
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
      { kind: "group", key: "project:q", projectId: "q", threads: [b] },
    ]);
  });
  it("keeps interleaved project groups, including single-thread ones, at their first slots", () => {
    const a = thread({ id: "a", projectId: "p" });
    const b = thread({ id: "b", projectId: "s" });
    const c = thread({ id: "c", projectId: "q" });
    const d = thread({ id: "d", projectId: "p" });
    const e = thread({ id: "e", projectId: "t" });
    const f = thread({ id: "f", projectId: "q" });
    const g = thread({ id: "g", projectId: "r" });
    expect(layoutActiveThreadsByProject([a, b, c, d, e, f, g])).toEqual([
      { kind: "group", key: "project:p", projectId: "p", threads: [a, d] },
      { kind: "group", key: "project:s", projectId: "s", threads: [b] },
      { kind: "group", key: "project:q", projectId: "q", threads: [c, f] },
      { kind: "group", key: "project:t", projectId: "t", threads: [e] },
      { kind: "group", key: "project:r", projectId: "r", threads: [g] },
    ]);
  });
  it("gives a single-thread project its own header", () => {
    const a = thread({ id: "a", projectId: "p" });
    expect(layoutActiveThreadsByProject([a])).toEqual([
      { kind: "group", key: "project:p", projectId: "p", threads: [a] },
    ]);
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
  it("copies manual order unchanged", () => {
    const result = sortActiveThreads(rows, "manual");
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

describe("projectOrderUnits", () => {
  it("maps a single row to its id and a group to all member ids in order", () => {
    const a = thread({ id: "a", projectId: "p" });
    const b = thread({ id: "b", projectId: "p" });
    const solo = thread({ id: "solo", projectId: "q" });
    expect(
      projectOrderUnits([
        { kind: "thread", key: "solo", thread: solo },
        { kind: "group", key: "project:p", projectId: "p", threads: [b, a] },
      ]),
    ).toEqual([
      { key: "solo", ids: ["solo"] },
      { key: "project:p", ids: ["b", "a"] },
    ]);
  });
  it("returns no order units for an empty layout", () => {
    expect(projectOrderUnits([])).toEqual([]);
  });
});

describe("expandProjectUnits", () => {
  const units: ProjectUnit[] = [
    { kind: "thread", key: "solo", thread: thread({ id: "solo" }) },
    { kind: "group", key: "project:p", projectId: "p", threads: [thread({ id: "a" }), thread({ id: "b" })] },
  ];
  it("follows the preview keys and preserves member order within a group", () => {
    expect(expandProjectUnits(["project:p", "solo"], units)).toEqual(["a", "b", "solo"]);
    expect(expandProjectUnits(["solo", "project:p"], units)).toEqual(["solo", "a", "b"]);
  });
  it("drops unknown keys without dropping the known units around them", () => {
    expect(expandProjectUnits(["missing", "project:p", "deleted", "solo"], units)).toEqual(["a", "b", "solo"]);
  });
  it("returns no ids when the preview or layout is empty", () => {
    expect(expandProjectUnits([], units)).toEqual([]);
    expect(expandProjectUnits(["solo"], [])).toEqual([]);
  });
});

describe("active view parts", () => {
  it.each(["none", "project", "section"])("accepts grouping %s", (group) => {
    expect(isActiveGrouping(group)).toBe(true);
  });
  it.each(["manual", "activity", "created"])("accepts order %s", (order) => {
    expect(isActiveOrder(order)).toBe(true);
  });
  it.each(["", "Manual", "activity ", "updated", "project", null])("rejects order %j", (order) => {
    expect(isActiveOrder(order)).toBe(false);
  });
  it.each(["", "manual", "Project", undefined])("rejects grouping %j", (group) => {
    expect(isActiveGrouping(group)).toBe(false);
  });
});

describe("sameOrder", () => {
  it("accepts equal sequences, including empty sequences", () => {
    expect(sameOrder(["a", "b"], ["a", "b"])).toBe(true);
    expect(sameOrder([], [])).toBe(true);
  });
  it("rejects reordered ids and unequal lengths in either direction", () => {
    expect(sameOrder(["a", "b"], ["b", "a"])).toBe(false);
    expect(sameOrder(["a"], ["a", "b"])).toBe(false);
    expect(sameOrder(["a", "b"], ["a"])).toBe(false);
  });
});

describe("projectUnitKey", () => {
  it("gives each project a stable key distinct from thread ids", () => {
    expect(projectUnitKey("p")).toBe("project:p");
    expect(projectUnitKey("q")).toBe("project:q");
    expect(projectUnitKey("p")).not.toBe(projectUnitKey("q"));
    expect(projectUnitKey("p")).not.toBe("p");
  });
});
