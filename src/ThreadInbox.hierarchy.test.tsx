// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { inbox, defaultSidebarSettings, thread, listProps, loadInboxApp } from "./test-inbox";

vi.mock("sonner", async () => (await import("./test-inbox")).sonnerMock());

await loadInboxApp();

describe("four-level sidebar hierarchy", () => {
  it.each([
    ["none", null],
    ["waiting-for-input", "needs-you"],
    ["unread-error", "failed"],
    ["unread-success", "done"],
    ["runtime", "working"],
  ] as const)("retains full active/attention path for %s", (indicator, status) => {
    const active = status === null;
    const rendered = renderSlot(
      inbox,
      { ...listProps, activeThreadId: active ? "deep" : null },
      {
        sidebarThreads: {
          status: "ready",
          projects: [],
          threads: [
            thread({ id: "root", title: "Root", updatedAt: Date.now() }),
            thread({ id: "child", title: "Child", parentThreadId: "root" }),
            thread({ id: "grandchild", title: "Grandchild", parentThreadId: "child" }),
            thread({ id: "deep", title: "Deep", parentThreadId: "grandchild", indicator }),
            thread({ id: "idle", title: "Idle sibling", parentThreadId: "grandchild" }),
          ],
        },
        rpc: { listLifecycle: () => ({ rows: [] }), getSidebarSettings: () => defaultSidebarSettings },
      },
    );
    const badge = screen.getByRole("button", { name: /^1 child thread/ });
    expect(badge.getAttribute("data-child-status")).toBe(status);
    const deep = screen.getByRole("button", { name: /^Open great-grandchild thread: Deep/ });
    expect(deep.getAttribute("aria-current")).toBe(active ? "page" : null);
    expect(screen.queryByText("Idle sibling")).toBeNull();
    const disclosure = screen.getByRole("button", { name: "Show 2 great-grandchild threads for Grandchild" });
    fireEvent.pointerDown(disclosure, { button: 0 });
    fireEvent.click(disclosure);
    expect(screen.getByText("Idle sibling")).toBeDefined();
    expect(rendered.sidebarActionCalls).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "Hide 2 great-grandchild threads for Grandchild" }));
    expect(screen.queryByText("Idle sibling")).toBeNull();
    fireEvent.pointerDown(deep, { button: 0 });
    expect(rendered.sidebarActionCalls).toEqual([{ method: "open", threadId: "deep" }]);
    expect(rendered.rpcCalls.filter((call) => /Parent|reorder|Pinned/.test(call.method))).toEqual([]);
    {
      fireEvent.click(screen.getByRole("button", { name: "Active" }));
      expect(screen.getByRole("link", { name: "Root" })).toBeDefined();
      expect(screen.getByRole("button", { name: /^Open great-grandchild thread: Deep/ })).toBeDefined();
    }
  });

  it("stops archived branches in sidebar rollup and disclosure", () => {
    window.localStorage.setItem("bb-sidebar:child-expansion:v1", JSON.stringify(["root"]));
    renderSlot(
      inbox,
      { ...listProps, activeThreadId: "deep" },
      {
        sidebarThreads: {
          status: "ready",
          projects: [],
          threads: [
            thread({ id: "root", title: "Root", parentThreadId: "missing", updatedAt: Date.now() }),
            thread({ id: "child", title: "Child", parentThreadId: "root" }),
            thread({ id: "grandchild", title: "Archived", parentThreadId: "child", isArchived: true }),
            thread({ id: "deep", title: "Hidden deep", parentThreadId: "grandchild", indicator: "unread-error" }),
          ],
        },
        rpc: { listLifecycle: () => ({ rows: [] }) },
      },
    );
    expect(screen.getByRole("button", { name: "1 child thread" })).toBeDefined();
    expect(screen.queryByRole("button", { name: /^Open great-grandchild/ })).toBeNull();
  });
});
it("guards cyclic child DTOs while expanding and retains deep sibling sort", async () => {
  const { ChildThreadList, childThreadsByParent } = await import("./ChildThreadList");
  const rows = [
    thread({ id: "child", title: "Child", parentThreadId: "grandchild", createdAt: 1 }),
    thread({ id: "grandchild", title: "Grandchild", parentThreadId: "child", createdAt: 2 }),
    thread({ id: "later", title: "Later", parentThreadId: "grandchild", createdAt: 4 }),
    thread({ id: "earlier", title: "Earlier", parentThreadId: "grandchild", createdAt: 3 }),
  ];
  const map = childThreadsByParent(rows);
  function Fixture() {
    return (
      <ChildThreadList
        threads={[rows[0]!]}
        childrenByParent={map}
        variant="sidebar"
        activeThreadId="earlier"
        onOpenThread={() => {}}
      />
    );
  }
  renderSlot({ component: Fixture }, {}, { sidebarThreads: { status: "ready", threads: rows, projects: [] } });
  expect(screen.getByRole("button", { name: "Open great-grandchild thread: Earlier" })).toBeDefined();
  const disclosure = screen.getByRole("button", { name: "Show 2 great-grandchild threads for Grandchild" });
  fireEvent.click(disclosure);
  const names = screen.getAllByRole("button", { name: /^Open / }).map((row) => row.getAttribute("aria-label"));
  expect(names).toEqual([
    "Open child thread: Child",
    "Open grandchild thread: Grandchild",
    "Open great-grandchild thread: Earlier",
    "Open great-grandchild thread: Later",
  ]);
  expect(screen.queryByRole("button", { name: /^Open descendant/ })).toBeNull();
});
it("honors disabled attention retention for fourth-level descendants", async () => {
  const rendered = renderSlot(inbox, listProps, {
    sidebarThreads: {
      status: "ready",
      projects: [],
      threads: [
        thread({ id: "root", title: "Root", updatedAt: Date.now() }),
        thread({ id: "child", title: "Child", parentThreadId: "root" }),
        thread({ id: "grandchild", title: "Grandchild", parentThreadId: "child" }),
        thread({ id: "deep", title: "Deep", parentThreadId: "grandchild", indicator: "waiting-for-input" }),
      ],
    },
    rpc: {
      listLifecycle: () => ({ rows: [] }),
      getSidebarSettings: () => ({ ...defaultSidebarSettings, showRunningChildrenWhenCollapsed: false }),
    },
  });
  const badge = await screen.findByRole("button", { name: "1 child thread, 1 need you" });
  await waitFor(() => expect(rendered.rpcCalls.some((call) => call.method === "getSidebarSettings")).toBe(true));
  expect(screen.queryByRole("button", { name: /^Open great-grandchild/ })).toBeNull();
  fireEvent.click(badge);
  fireEvent.click(screen.getByRole("button", { name: "Show 1 grandchild thread for Child" }));
  fireEvent.click(screen.getByRole("button", { name: "Show 1 great-grandchild thread for Grandchild" }));
  expect(screen.getByRole("button", { name: "Open great-grandchild thread: Deep, Needs you" })).toBeDefined();
  fireEvent.click(screen.getByRole("button", { name: "Active" }));
  expect(screen.queryByRole("link", { name: "Root" })).toBeNull();
});
