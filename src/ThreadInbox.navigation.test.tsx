// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { renderSlot } from "./test-slot";
import { inbox, thread, listProps, render, loadInboxApp } from "./test-inbox";

vi.mock("sonner", async () => (await import("./test-inbox")).sonnerMock());

await loadInboxApp();

describe("ThreadInbox", () => {
  // The DOM contract behind numbered thread shortcuts and thread.next/previous.
  // A plugin that drops these attributes silently breaks nine host shortcuts.
  it("marks every row as a host shortcut target", () => {
    render([thread({ id: "thr_x" })]);
    const row = screen.getByRole("link");
    expect(row.hasAttribute("data-sidebar-thread-shortcut-target")).toBe(true);
    expect(row.getAttribute("data-sidebar-thread-id")).toBe("thr_x");
  });

  // bb routes the row's link. toThread would also turn off the thread's saved
  // Full Screen, so a row click must leave navigation to bb.
  it("leaves a click to bb's link routing and closes the mobile drawer", () => {
    let navigated = 0;
    const rendered = renderSlot(
      inbox,
      { ...listProps, onNavigate: () => (navigated += 1) },
      {
        sidebarThreads: {
          status: "ready",
          threads: [thread({ id: "thr_open" })],
          projects: [{ id: "proj_1", name: "bb", isPersonal: false, href: "", settingsHref: "" }],
        },
        rpc: { listLifecycle: () => ({ rows: [] }) },
      },
    );
    const link = screen.getByRole("link");
    expect(link.getAttribute("href")).toBe("/projects/proj_1/threads/thr_open");
    fireEvent.click(link);
    expect(rendered.linkCalls).toEqual([{ href: "/projects/proj_1/threads/thr_open", split: false }]);
    expect(rendered.navigateCalls).toEqual([]);
    expect(navigated).toBe(1);

    // A double-click renames; its second click must not open the thread again.
    fireEvent.click(link, { detail: 2 });
    expect(rendered.linkCalls).toHaveLength(1);
  });

  // bb owns the modifier hold and numbering; rows draw what it assigns.
  it("shows bb's jump shortcut on a row in place of its status", () => {
    const threads = [thread({ id: "thr_a", title: "Thread A" }), thread({ id: "thr_b", title: "Thread B" })];
    const options = {
      sidebarThreads: {
        status: "ready" as const,
        threads,
        projects: [{ id: "proj_1", name: "bb", isPersonal: false, href: "", settingsHref: "" }],
      },
      rpc: { listLifecycle: () => ({ rows: [] }) },
    };
    const hints = () => [...document.querySelectorAll("kbd")].map((hint) => hint.textContent);

    const idle = renderSlot(inbox, listProps, options);
    expect(hints()).toEqual([]);
    const keys = (name: string) => screen.getByRole("link", { name }).getAttribute("aria-keyshortcuts");
    expect(keys("Thread A")).toBe("Alt+ArrowUp Alt+ArrowDown");
    idle.lifecycle.unmount();

    renderSlot(inbox, listProps, {
      ...options,
      sidebarShortcuts: { thr_a: { label: "⌘1", ariaKeyshortcuts: "Meta+1" } },
    });
    expect(hints()).toEqual(["⌘1"]);
    // The jump key joins the reorder keys the row already announces.
    expect(keys("Thread A")).toBe("Meta+1 Alt+ArrowUp Alt+ArrowDown");
    expect(keys("Thread B")).toBe("Alt+ArrowUp Alt+ArrowDown");
  });

  it("leaves a platform-modifier click to bb, which opens a split", () => {
    const rendered = render([thread({ id: "thr_modifier" })]);
    fireEvent.click(screen.getByRole("link"), { metaKey: true });

    expect(rendered.linkCalls).toEqual([{ href: "/projects/proj_1/threads/thr_modifier", split: true }]);
    expect(rendered.navigateCalls).toEqual([]);
    expect(screen.queryByRole("toolbar", { name: /threads selected/ })).toBeNull();
  });
});
