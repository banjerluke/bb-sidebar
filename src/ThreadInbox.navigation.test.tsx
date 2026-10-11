// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen } from "@testing-library/react";
import { renderSlot } from "@get-bb/plugin-sdk/testing/app";
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

  it("opens a thread on click and closes the mobile drawer", () => {
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
    fireEvent.click(screen.getByRole("link"));
    expect(rendered.sidebarActionCalls).toContainEqual({
      method: "open",
      threadId: "thr_open",
      options: { split: false },
    });
    expect(navigated).toBe(1);
  });

  it("shows bb's jump shortcut hints only while the modifier is held", () => {
    vi.useFakeTimers();
    try {
      render(Array.from({ length: 10 }, (_, index) => thread({ id: `thr_${index}`, title: `Thread ${index}` })));
      const hints = () => [...document.querySelectorAll("kbd")].map((hint) => hint.textContent);

      // jsdom reports no Mac platform, so the modifier is Control.
      fireEvent.keyDown(window, { key: "Control" });
      act(() => vi.advanceTimersByTime(699));
      expect(hints()).toEqual([]);

      act(() => vi.advanceTimersByTime(1));
      expect(hints()).toEqual(Array.from({ length: 9 }, (_, index) => `Ctrl + ${index + 1}`));

      fireEvent.keyUp(window, { key: "Control" });
      expect(hints()).toEqual([]);

      // A quick chord never shows them.
      fireEvent.keyDown(window, { key: "Control" });
      fireEvent.keyDown(window, { key: "c", ctrlKey: true });
      act(() => vi.advanceTimersByTime(1_000));
      expect(hints()).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("opens a thread normally when the platform modifier is held", () => {
    const rendered = render([thread({ id: "thr_modifier" })]);
    fireEvent.click(screen.getByRole("link"), { metaKey: true });

    expect(rendered.sidebarActionCalls).toContainEqual({
      method: "open",
      threadId: "thr_modifier",
      options: { split: false },
    });
    expect(screen.queryByRole("toolbar", { name: /threads selected/ })).toBeNull();
  });
});
