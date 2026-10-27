// @vitest-environment jsdom
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ThreadLimitState } from "./contract";
import { renderSlot } from "./test-slot";
import {
  defaultSidebarSettings,
  inbox,
  listProps,
  loadInboxApp,
  thread,
  toastMocks,
  SETTLED_NOTHING,
} from "./test-inbox";
import { deferred } from "./test-fixtures";
import { RATE_LIMITS_CHANNEL } from "./realtime-channels";

await loadInboxApp();
beforeEach(() => vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-10-26T19:49:00Z")));
afterEach(() => vi.restoreAllMocks());

const resetsAt = Date.parse("2026-10-27T22:00:00Z");
const warning: ThreadLimitState = {
  message: "You've hit your session limit · resets 5pm (America/Chicago)",
  resetsAt,
  timeZone: "America/Chicago",
  scheduled: null,
};
const scheduled: ThreadLimitState = {
  ...warning,
  scheduled: { id: "continue_1", sendAt: resetsAt + 30_000, failed: false },
};

function mount({
  display = "full",
  child = false,
  initial = warning,
  schedule,
  cancel,
}: {
  display?: string;
  child?: boolean;
  initial?: ThreadLimitState;
  schedule?: () => Promise<ThreadLimitState>;
  cancel?: () => Promise<void>;
} = {}) {
  let state = initial;
  const scheduleCall = vi.fn(async () => {
    state = schedule ? await schedule() : scheduled;
    return state;
  });
  const cancelCall = vi.fn(async () => {
    await cancel?.();
    state = { ...state, scheduled: null };
    return { ok: true };
  });
  const settleCall = vi.fn(() => ({ ok: true, reclaim: SETTLED_NOTHING }));
  const limited = thread({
    id: "limited",
    title: "Limited work",
    displayTitle: "Limited work",
    status: "error",
    runtimeStatus: "error",
    indicator: "none",
    isUnread: false,
    parentThreadId: child ? "parent" : null,
  });
  const slot = renderSlot(inbox, listProps, {
    sidebarThreads: {
      status: "ready",
      threads: child ? [thread({ id: "parent", title: "Parent work" }), limited] : [limited],
      projects: [{ id: "proj_1", name: "bb", isPersonal: false, href: "", settingsHref: "" }],
    },
    rpc: {
      getSidebarSettings: () => ({ ...defaultSidebarSettings, inactiveThreadsEnabled: false, threadDisplay: display }),
      listLifecycle: () => ({ rows: [] }),
      getThreadLimits: () => ({ limited: state }),
      scheduleLimitContinue: scheduleCall,
      cancelLimitContinue: cancelCall,
      settle: settleCall,
    },
  });
  return {
    slot,
    scheduleCall,
    cancelCall,
    settleCall,
    setState: (next: ThreadLimitState) => {
      state = next;
    },
  };
}

describe("sidebar rate-limit recovery", () => {
  it.each([
    ["before reset", warning, "Continue at 5pm for Limited work"],
    ["after reset", { ...warning, resetsAt: 1 }, "Continue now for Limited work"],
    ["scheduled", scheduled, "Cancel scheduled Continue for Limited work"],
  ])("keeps Settle and Snooze alongside limit recovery (%s)", async (_state, initial, label) => {
    const { settleCall, scheduleCall, cancelCall, slot } = mount({ initial });
    const continueButton = await screen.findByRole("button", { name: label });
    const row = continueButton.closest("li")!;
    expect(within(row).getByRole("combobox", { name: "Snooze thread" })).toBeDefined();
    fireEvent.click(within(row).getByRole("button", { name: "Settle thread" }));
    await waitFor(() => expect(settleCall).toHaveBeenCalledWith({ threadId: "limited" }));
    expect(scheduleCall).not.toHaveBeenCalled();
    expect(cancelCall).not.toHaveBeenCalled();
    expect(slot.inspection.navigateCalls).toHaveLength(0);
  });
  it.each(["full", "compact-all"])(
    "keeps a read thread's limit visible and schedules with one click (%s)",
    async (display) => {
      const gate = deferred<ThreadLimitState>();
      const { slot, scheduleCall, cancelCall } = mount({ display, schedule: () => gate.promise });
      expect(await screen.findByText("Limit reached")).toBeDefined();
      const button = screen.getByRole("button", { name: "Continue at 5pm for Limited work" });
      expect(button.closest("[data-limit-control]")).not.toBeNull();
      button.focus();
      fireEvent.click(button);
      fireEvent.click(button);
      expect(scheduleCall).toHaveBeenCalledTimes(1);
      expect(scheduleCall).toHaveBeenCalledWith({ threadId: "limited" });
      expect(button.getAttribute("aria-disabled")).toBe("true");
      expect(button.getAttribute("aria-busy")).toBe("true");
      await act(async () => gate.resolve(scheduled));
      expect(await screen.findByText("Scheduled · 5pm")).toBeDefined();
      expect(screen.getByRole("button", { name: "Cancel scheduled Continue for Limited work" })).toBe(button);
      expect(document.activeElement).toBe(button);
      fireEvent.click(screen.getByRole("button", { name: "Cancel scheduled Continue for Limited work" }));
      await screen.findByRole("button", { name: "Continue at 5pm for Limited work" });
      expect(cancelCall).toHaveBeenCalledWith({ threadId: "limited", queuedMessageId: "continue_1" });
      expect(slot.inspection.navigateCalls).toHaveLength(0);
    },
  );

  it("shows a durable scheduled state on mount, with a cancel option", async () => {
    mount({ initial: scheduled });
    expect(await screen.findByText("Scheduled · 5pm")).toBeDefined();
    expect(screen.getByRole("button", { name: "Cancel scheduled Continue for Limited work" })).toBeDefined();
    expect(screen.queryByRole("button", { name: "Continue at 5pm for Limited work" })).toBeNull();
  });

  it("offers the same action for a nested thread without nesting interactive controls", async () => {
    mount({ child: true });
    fireEvent.click(await screen.findByRole("button", { name: /^1 child thread/ }));
    const button = await screen.findByRole("button", { name: "Continue at 5pm for Limited work" });
    expect(button.parentElement?.closest("button, a")).toBeNull();
    fireEvent.click(button);
    expect(await screen.findByText("Scheduled · 5pm")).toBeDefined();
  });

  it("keeps the warning and cancel control when scheduling or cancellation fails", async () => {
    const { slot, setState } = mount({
      schedule: async () => {
        throw new Error("Offline");
      },
      cancel: async () => {
        throw new Error("Already sending");
      },
    });
    fireEvent.click(await screen.findByRole("button", { name: "Continue at 5pm for Limited work" }));
    await waitFor(() => expect(toastMocks.error).toHaveBeenCalled());
    expect(screen.getByText("Limit reached")).toBeDefined();
    setState(scheduled);
    await slot.behavior.emitRealtime(RATE_LIMITS_CHANNEL, {});
    fireEvent.click(await screen.findByRole("button", { name: "Cancel scheduled Continue for Limited work" }));
    await waitFor(() => expect(toastMocks.error).toHaveBeenCalledTimes(2));
    expect(screen.getByText("Scheduled · 5pm")).toBeDefined();
    expect(screen.getByRole("button", { name: "Cancel scheduled Continue for Limited work" })).toBeDefined();
  });

  it("allows choosing a time when the provider has no reset timestamp", async () => {
    const { scheduleCall } = mount({ initial: { ...warning, resetsAt: null, timeZone: null } });
    fireEvent.click(await screen.findByRole("button", { name: "Schedule… for Limited work" }));
    fireEvent.change(screen.getByLabelText("Continue at a time on this device"), {
      target: { value: "2026-10-28T17:00" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Schedule Continue" }));
    await waitFor(() =>
      expect(scheduleCall).toHaveBeenCalledWith({
        threadId: "limited",
        sendAt: new Date("2026-10-28T17:00").getTime(),
      }),
    );
  });

  it("reconciles a schedule changed by another client after reconnecting", async () => {
    const { slot, setState } = mount();
    await screen.findByText("Limit reached");
    await slot.behavior.setRealtimeConnectionState("reconnecting");
    setState(scheduled);
    await slot.behavior.setRealtimeConnectionState("connected");
    expect(await screen.findByText("Scheduled · 5pm")).toBeDefined();
    fireEvent.pointerMove(screen.getByRole("link", { name: "Limited work" }), { pointerType: "mouse" });
    const tooltip = await screen.findByRole("dialog", { name: "Thread details" });
    expect(within(tooltip).getByText(/You've hit your session limit/)).toBeDefined();
  });
});
