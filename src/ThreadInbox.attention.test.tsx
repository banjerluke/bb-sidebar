// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import { renderSlot } from "./test-slot";
import { inbox, listProps, thread, render, loadInboxApp } from "./test-inbox";

vi.mock("sonner", async () => (await import("./test-inbox")).sonnerMock());

await loadInboxApp();

// The three states that need attention get a labelled state line; the age stays.
describe("attention states", () => {
  const states = [
    ["waiting-for-input", "Thread needs user input", "Needs you", "text-[color:var(--bb-sidebar-tone-pending)]"],
    ["unread-error", "Unread thread failed", "Failed", "text-[color:var(--bb-sidebar-tone-error)]"],
    ["unread-success", "Unread thread succeeded", "Done", "text-[color:var(--bb-sidebar-tone-success)]"],
  ] as const;

  for (const [indicator, label, shortLabel, toneClass] of states) {
    it(`shows the ${indicator} label under the title, beside the age`, async () => {
      render([
        thread({
          id: `thr_${indicator}`,
          indicator,
          indicatorLabel: label,
          latestAttentionAt: Date.now() - (3 * 3_600_000 + 60_000),
        }),
      ]);
      expect(await screen.findByText(shortLabel)).toBeDefined();
      expect(screen.getByText(shortLabel).className).toContain(toneClass);
      expect(screen.getByText(shortLabel).closest("[data-state-line]")).not.toBeNull();
      expect(screen.getByText("3h")).toBeDefined();
    });
  }

  it("uses a working label instead of an unread success state", async () => {
    render([
      thread({
        id: "thr_busy",
        isUnread: true,
        indicator: "runtime",
        indicatorLabel: "Thread working",
      }),
    ]);
    expect(await screen.findByLabelText("Thread working")).toBeDefined();
    expect(screen.getByText("Working")).toBeDefined();
    expect(screen.queryByLabelText("Unread thread succeeded")).toBeNull();
  });

  it("names what an idle parent waits on and a settle that waits on the user", async () => {
    renderSlot(inbox, listProps, {
      sidebarThreads: {
        status: "ready",
        threads: [
          thread({ id: "parent", title: "Coordinator", isUnread: true, indicator: "unread-success" }),
          thread({ id: "a", title: "Worker A", parentThreadId: "parent", indicator: "runtime" }),
          thread({ id: "b", title: "Worker B", parentThreadId: "parent", indicator: "runtime" }),
          thread({ id: "done", title: "Self settled", isUnread: true, indicator: "unread-success" }),
        ],
        projects: [],
      },
      rpc: { listLifecycle: () => ({ rows: [] }), listSettleRequests: () => ({ threadIds: ["done"] }) },
    });
    const line = async (title: string) =>
      (await screen.findByRole("link", { name: title })).closest("li")!.querySelector("[data-state-line]")!;
    expect(within((await line("Coordinator")) as HTMLElement).getByText("Waiting on 2 children")).toBeDefined();
    expect(await within((await line("Self settled")) as HTMLElement).findByText("Settles once read")).toBeDefined();
  });

  it("shows the agent's note with its flag, and hides a stale last line while work runs", async () => {
    renderSlot(inbox, listProps, {
      sidebarThreads: {
        status: "ready",
        threads: [
          thread({ id: "noted", title: "Noted thread" }),
          thread({ id: "busy", title: "Busy thread", indicator: "runtime" }),
          thread({ id: "quiet", title: "Quiet thread" }),
        ],
        projects: [],
      },
      rpc: {
        listLifecycle: () => ({ rows: [] }),
        listThreadNotes: () => ({
          notes: {
            noted: { text: "Waiting for Tyler", by: "agent" },
            busy: { text: "Old last line", by: "auto" },
            quiet: { text: "Pushed the fix.", by: "auto" },
          },
        }),
      },
    });
    const line = async (title: string) =>
      (await screen.findByRole("link", { name: title }))
        .closest("li")!
        .querySelector<HTMLElement>("[data-state-line]")!;
    const noted = await line("Noted thread");
    expect(await within(noted).findByText("Waiting for Tyler")).toBeDefined();
    // With no state to show, the flag takes the icon column.
    expect(noted.firstElementChild!.querySelector('[data-icon="Flag"]')).not.toBeNull();
    expect(await within(await line("Quiet thread")).findByText("Pushed the fix.")).toBeDefined();
    expect(within(await line("Busy thread")).queryByText("Old last line")).toBeNull();
  });
});
