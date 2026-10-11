// @vitest-environment jsdom
import { afterEach, describe, expect, it, onTestFinished, vi } from "vitest";
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { renderSlot } from "@get-bb/plugin-sdk/testing/app";
import type { PluginSidebarThread } from "@get-bb/plugin-sdk";
import { DEFAULT_SNOOZE_PRESET_CONFIG, formatSnoozeWakeTime } from "./lifecycle";
import { isWorkingTree } from "./working-tree";
import { projectColorsById } from "./project-colors";
import { WORKING_EMPTY_LINES } from "./working-empty-lines";
import {
  app,
  inbox,
  sidebarSettings,
  PolicyMenu,
  SETTLED_NOTHING,
  defaultSidebarSettings,
  thread,
  provider,
  defaultProviders,
  listProps,
  render,
  statusSlotParts,
  nestedInteractiveControls,
  deferred,
  toastMocks,
  parkingActions,
  parkFromCard,
  parkFromMenu,
  loadInboxApp,
} from "./test-inbox";

vi.mock("sonner", async () => (await import("./test-inbox")).sonnerMock());

await loadInboxApp();

describe("ThreadInbox", () => {
  it("retains the newest child expansions after saving and remounting", async () => {
    const key = "bb-sidebar:child-expansion:v1";
    const oldIds = Array.from({ length: 100 }, (_, index) => `z${String(index).padStart(3, "0")}`);
    const allThreads = [...oldIds, "a-newest", "b-next"].flatMap((id) => [
      thread({ id, title: id }),
      thread({ id: `${id}-child`, title: `${id}-child`, parentThreadId: id }),
    ]);
    localStorage.setItem(key, JSON.stringify(oldIds));
    const first = render(allThreads);
    const expand = (id: string) => {
      const card = screen.getByRole("link", { name: id }).closest("li")!;
      fireEvent.click(within(card).getByRole("button", { name: "1 child thread" }));
    };
    expand("a-newest");
    await waitFor(() => expect(JSON.parse(localStorage.getItem(key)!)).toHaveLength(100));
    first.lifecycle.unmount();

    render(allThreads);
    expand("b-next");
    await waitFor(() =>
      expect(JSON.parse(localStorage.getItem(key)!)).toEqual([...oldIds.slice(2), "a-newest", "b-next"]),
    );
    // 200 threads rendered twice: the default 5s budget leaves this stress
    // case no headroom on a loaded CI runner.
  }, 30_000);

  it("restores child expansion outside the parent card body", () => {
    window.localStorage.setItem("bb-sidebar:child-expansion:v1", JSON.stringify(["parent"]));
    render([
      thread({ id: "parent", title: "Parent" }),
      thread({ id: "child", title: "Child", parentThreadId: "parent" }),
    ]);

    expect(screen.getByRole("list", { name: "Child threads" })).toBeDefined();
    const childList = screen.getByRole("list", { name: "Child threads" });
    expect(childList.closest("[data-parent-card]")).toBeNull();
  });

  it("reveals the active child without persisted expansion", () => {
    renderSlot(
      inbox,
      { ...listProps, activeThreadId: "child" },
      {
        sidebarThreads: {
          status: "ready",
          threads: [
            thread({ id: "parent", title: "Parent" }),
            thread({ id: "child", title: "Child", parentThreadId: "parent" }),
          ],
          projects: [{ id: "proj_1", name: "bb", isPersonal: false, href: "", settingsHref: "" }],
        },
        rpc: { listLifecycle: () => ({ rows: [] }) },
      },
    );

    expect(screen.getByRole("list", { name: "Child threads" })).toBeDefined();
    expect(screen.getByText("Child")).toBeDefined();
  });

  it("collapses a parent while its child is active, keeping only that child visible", () => {
    renderSlot(
      inbox,
      { ...listProps, activeThreadId: "child-a" },
      {
        sidebarThreads: {
          status: "ready",
          threads: [
            thread({ id: "parent", title: "Parent" }),
            thread({ id: "child-a", title: "Child A", parentThreadId: "parent" }),
            thread({ id: "child-b", title: "Child B", parentThreadId: "parent" }),
          ],
          projects: [{ id: "proj_1", name: "bb", isPersonal: false, href: "", settingsHref: "" }],
        },
        rpc: { listLifecycle: () => ({ rows: [] }) },
      },
    );

    const badge = screen.getByRole("button", { name: "2 child threads" });
    expect(badge.getAttribute("aria-expanded")).toBe("false");
    expect(screen.getByText("Child A")).toBeDefined();
    expect(screen.queryByText("Child B")).toBeNull();
    const activeRow = screen.getByRole("button", {
      name: "Open child thread: Child A",
    });
    expect(activeRow.getAttribute("aria-current")).toBe("page");
    expect(activeRow.closest("[data-child-thread-row]")?.className).toContain("bg-sidebar-accent");

    fireEvent.click(badge);
    expect(badge.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("Child A")).toBeDefined();
    expect(screen.getByText("Child B")).toBeDefined();

    fireEvent.click(badge);
    expect(badge.getAttribute("aria-expanded")).toBe("false");
    expect(screen.getByText("Child A")).toBeDefined();
    expect(screen.queryByText("Child B")).toBeNull();
  });

  it("collapses a grandchild disclosure while a grandchild is active", () => {
    renderSlot(
      inbox,
      { ...listProps, activeThreadId: "grandchild-a" },
      {
        sidebarThreads: {
          status: "ready",
          threads: [
            thread({ id: "parent", title: "Parent" }),
            thread({ id: "child", title: "Child", parentThreadId: "parent" }),
            thread({
              id: "grandchild-a",
              title: "Grandchild A",
              parentThreadId: "child",
            }),
            thread({
              id: "grandchild-b",
              title: "Grandchild B",
              parentThreadId: "child",
            }),
          ],
          projects: [{ id: "proj_1", name: "bb", isPersonal: false, href: "", settingsHref: "" }],
        },
        rpc: { listLifecycle: () => ({ rows: [] }) },
      },
    );

    const disclosure = screen.getByRole("button", {
      name: "Show 2 grandchild threads for Child",
    });
    expect(disclosure.getAttribute("aria-expanded")).toBe("false");
    expect(screen.getByText("Grandchild A")).toBeDefined();
    expect(screen.queryByText("Grandchild B")).toBeNull();

    fireEvent.click(disclosure);
    expect(disclosure.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("Grandchild B")).toBeDefined();

    fireEvent.click(disclosure);
    expect(disclosure.getAttribute("aria-expanded")).toBe("false");
    expect(screen.getByText("Grandchild A")).toBeDefined();
    expect(screen.queryByText("Grandchild B")).toBeNull();
  });

  it("keeps an active child's parked parent visible on a collapsed shelf", async () => {
    renderSlot(
      inbox,
      { ...listProps, activeThreadId: "child" },
      {
        sidebarThreads: {
          status: "ready",
          threads: [
            thread({ id: "parent", title: "Parked parent" }),
            thread({ id: "child", title: "Active child", parentThreadId: "parent" }),
          ],
          projects: [{ id: "proj_1", name: "bb", isPersonal: false, href: "", settingsHref: "" }],
        },
        rpc: {
          listLifecycle: () => ({
            rows: [
              {
                threadId: "parent",
                settledAt: 200,
                snoozedUntil: null,
                snoozedAt: null,
              },
            ],
          }),
        },
      },
    );

    const settled = await screen.findByRole("region", { name: "Settled" });
    expect(within(settled).getByRole("button", { expanded: false })).toBeDefined();
    expect(within(settled).getByText("Parked parent")).toBeDefined();
  });

  it("reveals the active grandchild and its child disclosure", () => {
    renderSlot(
      inbox,
      { ...listProps, activeThreadId: "grandchild" },
      {
        sidebarThreads: {
          status: "ready",
          threads: [
            thread({ id: "parent", title: "Parent" }),
            thread({ id: "child", title: "Child", parentThreadId: "parent" }),
            thread({
              id: "grandchild",
              title: "Grandchild",
              parentThreadId: "child",
            }),
          ],
          projects: [{ id: "proj_1", name: "bb", isPersonal: false, href: "", settingsHref: "" }],
        },
        rpc: { listLifecycle: () => ({ rows: [] }) },
      },
    );

    expect(screen.getByRole("list", { name: "Grandchildren of Child" })).toBeDefined();
    expect(screen.getByText("Grandchild")).toBeDefined();
  });

  it("prunes expansion state for parents that no longer have children", async () => {
    window.localStorage.setItem("bb-sidebar:child-expansion:v1", JSON.stringify(["parent", "deleted-parent"]));
    render([
      thread({ id: "parent", title: "Parent" }),
      thread({ id: "child", title: "Child", parentThreadId: "parent" }),
    ]);

    await waitFor(() =>
      expect(JSON.parse(window.localStorage.getItem("bb-sidebar:child-expansion:v1") ?? "[]")).toEqual(["parent"]),
    );
  });

  it("archives the selected child instead of its parent", async () => {
    const rendered = render([
      thread({ id: "parent", title: "Parent" }),
      thread({ id: "child", title: "Child", parentThreadId: "parent" }),
    ]);
    fireEvent.click(screen.getByRole("button", { name: "1 child thread" }));

    fireEvent.contextMenu(screen.getByRole("button", { name: "Open child thread: Child" }));

    fireEvent.click(within(await screen.findByRole("menu", { name: "Thread actions" })).getByText("Archive"));
    expect(rendered.sidebarActionCalls).toContainEqual({
      method: "archive",
      threadId: "child",
    });
    expect(rendered.sidebarActionCalls).not.toContainEqual({
      method: "archive",
      threadId: "parent",
    });
  });

  it("releases the agent sessions archive leaves loaded", async () => {
    const rendered = render([
      thread({ id: "parent", title: "Parent" }),
      thread({ id: "idle-child", title: "Idle child", parentThreadId: "parent" }),
      thread({
        id: "busy-child",
        title: "Busy child",
        parentThreadId: "parent",
        indicator: "runtime",
      }),
      thread({ id: "stranger", title: "Stranger" }),
    ]);

    fireEvent.contextMenu(screen.getByText("Parent"));
    fireEvent.click(within(await screen.findByRole("menu", { name: "Thread actions" })).getByText("Archive"));

    expect(rendered.sidebarActionCalls).toContainEqual({
      method: "archive",
      threadId: "parent",
    });
    await waitFor(() =>
      expect(rendered.rpcCalls).toContainEqual({
        method: "releaseRuntimes",
        input: { threadIds: ["parent", "idle-child"] },
      }),
    );
  });

  for (const busyChild of [
    thread({ id: "running", title: "Running child", indicator: "runtime" }),
    thread({
      id: "needs-input",
      title: "Needs input child",
      hasPendingInteraction: true,
    }),
  ]) {
    it(`disables Archive for a busy child: ${busyChild.id}`, async () => {
      render([thread({ id: "parent", title: "Parent" }), { ...busyChild, parentThreadId: "parent" }]);
      fireEvent.click(screen.getByRole("button", { name: /^1 child thread/ }));
      fireEvent.contextMenu(
        screen.getByRole("button", {
          name: `Open child thread: ${busyChild.title}${busyChild.hasPendingInteraction ? ", Needs you" : ", Working"}`,
        }),
      );

      const archive = within(await screen.findByRole("menu", { name: "Thread actions" })).getByText("Archive");
      expect(archive.getAttribute("data-disabled")).not.toBeNull();
    });
  }

  it("shows one collapsed grandchild level without changing the parent count", () => {
    const rendered = render([
      thread({ id: "parent", title: "Parent" }),
      thread({
        id: "child",
        title: "Child",
        parentThreadId: "parent",
      }),
      thread({
        id: "grandchild",
        title: "Grandchild",
        parentThreadId: "child",
      }),
      thread({
        id: "great-grandchild",
        title: "Great-grandchild",
        parentThreadId: "grandchild",
      }),
    ]);

    const parentBadge = screen.getByRole("button", {
      name: "1 child thread",
    });
    fireEvent.click(parentBadge);

    const childList = screen.getByRole("list", { name: "Child threads" });
    expect(within(childList).getByText("Child")).toBeDefined();
    expect(screen.queryByText("Grandchild")).toBeNull();
    expect(screen.queryByText("Great-grandchild")).toBeNull();

    const disclosure = within(childList).getByRole("button", {
      name: "Show 1 grandchild thread for Child",
    });
    expect(disclosure.getAttribute("aria-expanded")).toBe("false");
    expect(disclosure.querySelector('[data-icon="ChevronDown"]')).not.toBeNull();

    fireEvent.click(disclosure);

    const grandchildList = screen.getByRole("list", {
      name: "Grandchildren of Child",
    });
    expect(grandchildList.getAttribute("data-grandchild-thread-list")).toBe("sidebar");
    expect(within(grandchildList).getByText("Grandchild")).toBeDefined();
    expect(screen.queryByText("Great-grandchild")).toBeNull();
    expect(disclosure.getAttribute("aria-expanded")).toBe("true");
    expect(disclosure.querySelector('[data-icon="ChevronUp"]')).not.toBeNull();

    fireEvent.click(
      within(grandchildList).getByRole("button", {
        name: "Open grandchild thread: Grandchild",
      }),
    );
    expect(rendered.sidebarActionCalls).toContainEqual({
      method: "open",
      threadId: "grandchild",
      options: { split: false },
    });
  });

  it("removes archived children from the sidebar badge and list", () => {
    render([
      thread({ id: "parent", title: "Parent" }),
      thread({
        id: "visible-child",
        title: "Visible child",
        parentThreadId: "parent",
      }),
      thread({
        id: "archived-child",
        title: "Archived child",
        parentThreadId: "parent",
        isArchived: true,
      }),
    ]);

    fireEvent.click(screen.getByRole("button", { name: "1 child thread" }));
    expect(screen.getByText("Visible child")).toBeDefined();
    expect(screen.queryByText("Archived child")).toBeNull();
  });
});
