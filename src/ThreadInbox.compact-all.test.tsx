// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import { renderSlot } from "./test-slot";
import { inbox, defaultSidebarSettings, thread, listProps, loadInboxApp } from "./test-inbox";

vi.mock("sonner", async () => (await import("./test-inbox")).sonnerMock());

await loadInboxApp();

const projects = [{ id: "proj_1", name: "bb", isPersonal: false, href: "", settingsHref: "" }];
const card = (title: string) => screen.getByRole("link", { name: title }).closest("[data-parent-card]") as HTMLElement;
const folded = (title: string) => card(title).classList.contains("h-8");

function renderCompactAll(
  threads: PluginSidebarThread[],
  { rows = [], ...settings }: { rows?: unknown[]; keepPinnedThreadsFull?: boolean; keepWokeThreadsFull?: boolean } = {},
  acknowledgeWake?: (threadId: string) => void,
) {
  return renderSlot(inbox, listProps, {
    sidebarThreads: { status: "ready", threads, projects },
    rpc: {
      getSidebarSettings: () => ({
        ...defaultSidebarSettings,
        inactiveThreadsEnabled: false,
        threadDisplay: "compact-all",
        compactWorkingThreads: true,
        ...settings,
      }),
      listLifecycle: () => ({ rows }),
      acknowledgeWake: (input) => {
        acknowledgeWake?.((input as { threadId: string }).threadId);
        return { ok: true };
      },
    },
  });
}

describe("Compact all threads", () => {
  it("keeps every Active and Pinned thread on one line with its signals", async () => {
    renderCompactAll([
      thread({ id: "idle", title: "Idle work" }),
      thread({ id: "busy", title: "Busy work", indicator: "runtime", indicatorLabel: "Working" }),
      thread({ id: "asking", title: "Asking work", indicator: "waiting-for-input", hasPendingInteraction: true }),
      thread({ id: "unread", title: "Unread work", isUnread: true }),
      thread({ id: "pinned", title: "Pinned work", isPinned: true, pinnedAt: 1, pinSortKey: "a" }),
      thread({ id: "parent", title: "Parent work" }),
      thread({ id: "child", title: "Child work", parentThreadId: "parent" }),
    ]);
    await screen.findByRole("link", { name: "Idle work" });
    await waitFor(() => expect(folded("Idle work")).toBe(true));
    for (const title of ["Busy work", "Asking work", "Unread work", "Pinned work", "Parent work"]) {
      expect(folded(title)).toBe(true);
    }
    // Needs-attention and unread stay one line, with their status and weight.
    expect(within(card("Asking work")).getByText(/Needs you|Waiting/)).toBeDefined();
    expect(within(card("Unread work")).getByText("Unread work").className).toContain("font-medium");
    expect(within(card("Parent work")).getByRole("button", { name: /^1 child thread/ })).toBeDefined();
    expect(screen.queryByText("Child work")).toBeNull();
  });

  it.each([false, true])("keeps pinned threads full only when asked (%s)", async (keepPinnedThreadsFull) => {
    renderCompactAll(
      [
        thread({ id: "active", title: "Active work" }),
        thread({ id: "pinned", title: "Pinned work", isPinned: true, pinnedAt: 1, pinSortKey: "a" }),
      ],
      { keepPinnedThreadsFull },
    );
    await screen.findByRole("link", { name: "Pinned work" });
    await waitFor(() => expect(folded("Active work")).toBe(true));
    expect(folded("Pinned work")).toBe(!keepPinnedThreadsFull);
  });

  it.each([false, true])("keeps woken threads full only when asked (%s)", async (keepWokeThreadsFull) => {
    const now = Date.now();
    const acknowledged: string[] = [];
    renderCompactAll(
      [
        thread({ id: "woke", title: "Woke work", updatedAt: now - 31 * 60_000 }),
        thread({ id: "other", title: "Other" }),
      ],
      {
        keepWokeThreadsFull,
        rows: [{ threadId: "woke", settledAt: null, snoozedUntil: now - 1, snoozedAt: now - 60_000 }],
      },
      (threadId) => acknowledged.push(threadId),
    );
    const marker = await screen.findByRole("button", { name: "Dismiss Woke marker" });
    await waitFor(() => expect(folded("Other")).toBe(true));
    expect(folded("Woke work")).toBe(!keepWokeThreadsFull);
    expect(card("Woke work").contains(marker)).toBe(true);
    fireEvent.click(marker);
    await waitFor(() => expect(acknowledged).toEqual(["woke"]));
  });
});
