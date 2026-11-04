import { describe, expect, it } from "vitest";
import type { PluginSidebarThread } from "@get-bb/plugin-sdk";
import { idleSidebarThreadFields } from "./test-fixtures";
import { sidebarRowState, sidebarRowStateLabel } from "./row-state";

function thread(overrides: Partial<PluginSidebarThread> = {}): PluginSidebarThread {
  return {
    ...idleSidebarThreadFields,
    id: "parent",
    projectId: "proj_1",
    title: "Parent",
    titleFallback: null,
    parentThreadId: null,
    sectionId: null,
    originKind: null,
    originPluginId: null,
    providerId: "codex",
    hasPendingInteraction: false,
    activity: { workflows: 0, backgroundAgents: 0, backgroundCommands: 0, planMode: 0, goals: 0 },
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

const busy = (id: string, parentThreadId = "parent") => thread({ id, parentThreadId, indicator: "runtime" });
const idle = (id: string, parentThreadId = "parent") => thread({ id, parentThreadId });

function stateOf(
  parent: PluginSidebarThread,
  children: PluginSidebarThread[],
  { childNeedsYou = false, settlesOnceRead = false, grandchildren = [] as PluginSidebarThread[] } = {},
) {
  const childrenByParent = new Map<string, PluginSidebarThread[]>();
  for (const child of [...children, ...grandchildren]) {
    childrenByParent.set(child.parentThreadId!, [...(childrenByParent.get(child.parentThreadId!) ?? []), child]);
  }
  const state = sidebarRowState(parent, { childNeedsYou, settlesOnceRead, children, childrenByParent });
  return state && sidebarRowStateLabel(state);
}

describe("sidebarRowState", () => {
  it("counts children with work anywhere below them, not idle ones", () => {
    expect(stateOf(thread(), [busy("a"), idle("b"), idle("c")], { grandchildren: [busy("c1", "c")] })).toBe(
      "Waiting on 2 children",
    );
    expect(stateOf(thread(), [busy("a"), idle("b")])).toBe("Waiting on 1 child");
    expect(stateOf(thread(), [idle("a")])).toBeNull();
  });

  it("names an idle parent that only looks unread", () => {
    expect(stateOf(thread({ isUnread: true, indicator: "unread-success" }), [busy("a")])).toBe("Waiting on 1 child");
  });

  it("puts a child's question ahead of children still working", () => {
    expect(stateOf(thread(), [busy("a")], { childNeedsYou: true })).toBe("Child needs you");
  });

  it("shows a waiting settle instead of Done, but not while children work", () => {
    expect(stateOf(thread({ indicator: "unread-success" }), [], { settlesOnceRead: true })).toBe("Settles once read");
    expect(stateOf(thread(), [busy("a")], { settlesOnceRead: true })).toBe("Waiting on 1 child");
  });

  it.each([
    ["a raised hand", { hasPendingInteraction: true }],
    ["a failure", { indicator: "unread-error" }],
    ["a failed send", { queuedWork: "failed" }],
    ["its own work", { indicator: "runtime" }],
  ] as const)("leaves bb's state alone for %s", (_, overrides) => {
    expect(stateOf(thread(overrides), [busy("a")], { childNeedsYou: true, settlesOnceRead: true })).toBeNull();
  });
});
