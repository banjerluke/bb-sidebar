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

describe("parking threads", () => {
  it("previews every Settled row and cleans only after confirmation", async () => {
    const settledThreads = Array.from({ length: 11 }, (_, index) =>
      thread({ id: `thr_${index}`, title: `Finished ${index}` }),
    );
    const previewSettledCleanup = vi.fn((input: unknown) => ({
      token: "98bb67b5-b58b-4fc4-9a55-34e557dc8f55",
      threads: (input as { threadIds: string[] }).threadIds.slice(0, 2).map((threadId, index) => ({
        threadId,
        title: threadId,
        terminalCount: index === 0 ? 1 : 0,
        ports: index === 1 ? [3000] : [],
      })),
      skipped: [],
    }));
    const cleanSettled = vi.fn(() => ({
      closedTerminals: 1,
      signalledPorts: [{ threadId: "thr_1", port: 3000 }],
      remainingPorts: [],
      skipped: [],
      failed: [],
    }));
    renderSlot(inbox, listProps, {
      sidebarThreads: {
        status: "ready",
        threads: settledThreads,
        projects: [{ id: "proj_1", name: "bb", isPersonal: false, href: "", settingsHref: "" }],
      },
      rpc: {
        listLifecycle: () => ({
          rows: settledThreads.map((item) => ({
            threadId: item.id,
            settledAt: 200,
            snoozedUntil: null,
            snoozedAt: null,
          })),
        }),
        previewSettledCleanup,
        cleanSettled,
      },
    });
    const shelf = await screen.findByRole("region", { name: "Settled" });
    fireEvent.click(within(shelf).getByRole("button", { name: "Close terminals and ports of settled threads" }));
    const dialog = await screen.findByRole("dialog", { name: "Clean settled resources?" });
    await waitFor(() => expect(previewSettledCleanup).toHaveBeenCalledTimes(1));
    expect(new Set((previewSettledCleanup.mock.calls[0]![0] as { threadIds: string[] }).threadIds)).toEqual(
      new Set(settledThreads.map((item) => item.id)),
    );
    expect(dialog.textContent).toContain("1 terminal to close · 1 listening port to stop");
    expect(dialog.textContent).not.toContain("0 terminals");
    expect(dialog.textContent).not.toContain("session");
    expect(within(dialog).queryByText("thr_2")).toBeNull();
    expect(cleanSettled).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Clean resources" }));
    await waitFor(() => expect(cleanSettled).toHaveBeenCalledWith({ token: "98bb67b5-b58b-4fc4-9a55-34e557dc8f55" }));
    expect(dialog.textContent).toContain("1 terminal closed · 1 port shutdown request sent");
  });

  it("marks each project's rows with that project's own soft colour", async () => {
    const settled = [
      thread({ id: "thr_a", title: "In bb" }),
      thread({ id: "thr_b", title: "Also bb" }),
      thread({ id: "thr_c", title: "In Git-Local", projectId: "proj_2" }),
    ];
    renderSlot(inbox, listProps, {
      sidebarThreads: {
        status: "ready",
        threads: settled,
        projects: [
          { id: "proj_1", name: "bb", isPersonal: false, href: "", settingsHref: "" },
          { id: "proj_2", name: "Git-Local", isPersonal: false, href: "", settingsHref: "" },
        ],
      },
      rpc: {
        getSidebarSettings: () => ({ ...defaultSidebarSettings, projectColorsEnabled: true }),
        getProjectColors: () => ({ colors: {} }),
        listLifecycle: () => ({
          rows: settled.map((item) => ({
            threadId: item.id,
            settledAt: 200,
            snoozedUntil: null,
            snoozedAt: null,
          })),
        }),
      },
    });
    const shelf = await screen.findByRole("region", { name: "Settled" });
    fireEvent.click(within(shelf).getByRole("button", { name: /Settled/ }));
    const stripeOf = async (title: string) =>
      (await within(shelf).findByText(title))
        .closest("li")!
        .querySelector("[data-project-stripe]")!
        .getAttribute("style");
    const colors = projectColorsById(["proj_1", "proj_2"], {});
    expect(colors.get("proj_1")).not.toBe(colors.get("proj_2"));
    expect(await stripeOf("In bb")).toContain(colors.get("proj_1")!);
    expect(await stripeOf("Also bb")).toContain(colors.get("proj_1")!);
    expect(await stripeOf("In Git-Local")).toContain(colors.get("proj_2")!);
    const name = within((await within(shelf).findByText("In Git-Local")).closest("li")!).getByText("Git-Local");
    expect(name.className).toContain("bb-sidebar-project-name");
    expect(name.style.getPropertyValue("--bb-sidebar-project")).toBe(colors.get("proj_2"));
  });

  it("shows an empty preview without a Clean confirmation button", async () => {
    renderSlot(inbox, listProps, {
      sidebarThreads: {
        status: "ready",
        threads: [thread({ id: "thr_empty", title: "Finished" })],
        projects: [{ id: "proj_1", name: "bb", isPersonal: false, href: "", settingsHref: "" }],
      },
      rpc: {
        listLifecycle: () => ({
          rows: [{ threadId: "thr_empty", settledAt: 200, snoozedUntil: null, snoozedAt: null }],
        }),
        previewSettledCleanup: () => ({ token: "98bb67b5-b58b-4fc4-9a55-34e557dc8f55", threads: [], skipped: [] }),
      },
    });
    const shelf = await screen.findByRole("region", { name: "Settled" });
    fireEvent.click(within(shelf).getByRole("button", { name: "Close terminals and ports of settled threads" }));
    const dialog = await screen.findByRole("dialog", { name: "Clean settled resources?" });
    await waitFor(() =>
      expect(dialog.textContent).toContain("No live terminals or thread-owned listening ports found."),
    );
    expect(within(dialog).queryByRole("button", { name: "Clean resources" })).toBeNull();
  });

  it("opens a thread from the Clean preview and closes the dialog", async () => {
    const onNavigate = vi.fn();
    const rendered = renderSlot(
      inbox,
      { ...listProps, onNavigate },
      {
        sidebarThreads: {
          status: "ready",
          threads: [thread({ id: "thr_terminal", title: "Check this terminal" })],
          projects: [{ id: "proj_1", name: "bb", isPersonal: false, href: "", settingsHref: "" }],
        },
        rpc: {
          listLifecycle: () => ({
            rows: [{ threadId: "thr_terminal", settledAt: 200, snoozedUntil: null, snoozedAt: null }],
          }),
          previewSettledCleanup: () => ({
            token: "98bb67b5-b58b-4fc4-9a55-34e557dc8f55",
            threads: [{ threadId: "thr_terminal", title: "Check this terminal", terminalCount: 1, ports: [] }],
            skipped: [],
          }),
        },
      },
    );
    const shelf = await screen.findByRole("region", { name: "Settled" });
    fireEvent.click(within(shelf).getByRole("button", { name: "Close terminals and ports of settled threads" }));
    const dialog = await screen.findByRole("dialog", { name: "Clean settled resources?" });
    fireEvent.click(await within(dialog).findByRole("button", { name: "Open thread: Check this terminal" }));
    expect(rendered.sidebarActionCalls).toContainEqual({ method: "open", threadId: "thr_terminal" });
    expect(onNavigate).toHaveBeenCalledOnce();
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Clean settled resources?" })).toBeNull());
  });

  it("keeps the Clean preview open while cleanup is running", async () => {
    const pending = deferred<{
      closedTerminals: number;
      signalledPorts: never[];
      remainingPorts: never[];
      skipped: never[];
      failed: never[];
    }>();
    const rendered = renderSlot(inbox, listProps, {
      sidebarThreads: {
        status: "ready",
        threads: [thread({ id: "thr_terminal", title: "Check this terminal" })],
        projects: [{ id: "proj_1", name: "bb", isPersonal: false, href: "", settingsHref: "" }],
      },
      rpc: {
        listLifecycle: () => ({
          rows: [{ threadId: "thr_terminal", settledAt: 200, snoozedUntil: null, snoozedAt: null }],
        }),
        previewSettledCleanup: () => ({
          token: "98bb67b5-b58b-4fc4-9a55-34e557dc8f55",
          threads: [{ threadId: "thr_terminal", title: "Check this terminal", terminalCount: 1, ports: [] }],
          skipped: [],
        }),
        cleanSettled: () => pending.promise,
      },
    });
    const shelf = await screen.findByRole("region", { name: "Settled" });
    fireEvent.click(within(shelf).getByRole("button", { name: "Close terminals and ports of settled threads" }));
    const dialog = await screen.findByRole("dialog", { name: "Clean settled resources?" });
    const cleanButton = await within(dialog).findByRole("button", { name: "Clean resources" });
    fireEvent.click(cleanButton);
    const openButton = within(dialog).getByRole("button", { name: "Open thread: Check this terminal" });
    expect(openButton).toHaveProperty("disabled", true);
    fireEvent.click(openButton);
    expect(rendered.sidebarActionCalls).not.toContainEqual({ method: "open", threadId: "thr_terminal" });
    expect(screen.getByRole("dialog", { name: "Clean settled resources?" })).toBeDefined();
    pending.resolve({ closedTerminals: 1, signalledPorts: [], remainingPorts: [], skipped: [], failed: [] });
    await waitFor(() => expect(dialog.textContent).toContain("1 terminal closed"));
  });

  it("keeps cleanup failures visible after the last thread leaves Settled", async () => {
    const pending = deferred<never>();
    let settled = true;
    const rendered = renderSlot(inbox, listProps, {
      sidebarThreads: {
        status: "ready",
        threads: [thread({ id: "thr_terminal", title: "Last settled thread" })],
        projects: [{ id: "proj_1", name: "bb", isPersonal: false, href: "", settingsHref: "" }],
      },
      rpc: {
        listLifecycle: () => ({
          rows: settled ? [{ threadId: "thr_terminal", settledAt: 200, snoozedUntil: null, snoozedAt: null }] : [],
        }),
        previewSettledCleanup: () => ({
          token: "98bb67b5-b58b-4fc4-9a55-34e557dc8f55",
          threads: [{ threadId: "thr_terminal", title: "Last settled thread", terminalCount: 1, ports: [] }],
          skipped: [],
        }),
        cleanSettled: () => pending.promise,
      },
    });
    const shelf = await screen.findByRole("region", { name: "Settled" });
    fireEvent.click(within(shelf).getByRole("button", { name: "Close terminals and ports of settled threads" }));
    const dialog = await screen.findByRole("dialog", { name: "Clean settled resources?" });
    fireEvent.click(await within(dialog).findByRole("button", { name: "Clean resources" }));
    await within(dialog).findByRole("button", { name: "Cleaning..." });

    settled = false;
    await rendered.emitRealtime("lifecycle", {});
    await waitFor(() => expect(shelf.hidden).toBe(true));
    expect(screen.getByRole("dialog", { name: "Clean settled resources?" })).toBe(dialog);

    await act(async () => pending.reject(new Error("Cleanup connection lost")));
    expect((await within(dialog).findByRole("alert")).textContent).toBe("Cleanup connection lost");
    expect(within(dialog).getByRole("button", { name: "Cancel" })).toHaveProperty("disabled", false);
  });

  it("moves a settled thread to the Settled shelf", async () => {
    renderSlot(inbox, listProps, {
      sidebarThreads: {
        status: "ready",
        threads: [thread({ id: "thr_done", title: "Finished work" })],
        projects: [{ id: "proj_1", name: "bb", isPersonal: false, href: "", settingsHref: "" }],
      },
      rpc: {
        listLifecycle: () => ({
          rows: [
            {
              threadId: "thr_done",
              settledAt: 200,
              snoozedUntil: null,
              snoozedAt: null,
            },
          ],
        }),
      },
    });
    // The shelf renders once the lifecycle read resolves.
    const shelf = await screen.findByRole("region", { name: "Settled" });
    expect(within(shelf).getByText(/Settled \(1\)/)).toBeDefined();
    // Collapsed by default: parked work is out of the way, never gone.
    expect(screen.queryByText("Finished work")).toBeNull();
    fireEvent.click(within(shelf).getByRole("button", { expanded: false }));
    expect(within(shelf).getByText("Finished work")).toBeDefined();
    expect(within(shelf).getByRole("listitem").textContent).toMatch(/bb\s*·\s*Finished work/);
    expect(within(shelf).getByLabelText("bb · Finished work")).toBeDefined();
  });

  it("keeps a working thread out of the shelves and offers no park action", async () => {
    renderSlot(inbox, listProps, {
      sidebarThreads: {
        status: "ready",
        threads: [
          thread({
            id: "thr_busy",
            title: "Still running",
            indicator: "runtime",
            activity: {
              workflows: 0,
              backgroundAgents: 0,
              backgroundCommands: 0,
              planMode: 0,
              goals: 0,
            },
          }),
        ],
        projects: [{ id: "proj_1", name: "bb", isPersonal: false, href: "", settingsHref: "" }],
      },
      // Settled in the store, but still working: it must stay visible.
      rpc: {
        listLifecycle: () => ({
          rows: [
            {
              threadId: "thr_busy",
              settledAt: 200,
              snoozedUntil: null,
              snoozedAt: null,
            },
          ],
        }),
      },
    });
    expect(await screen.findByText("Still running")).toBeDefined();
    expect(screen.queryByRole("region", { name: "Settled" })).toBeNull();
    expect(screen.queryByLabelText("Settle thread")).toBeNull();
  });

  it.each([
    [
      "an unread thread whose turn is still running",
      { status: "active" as const, indicator: "unread-success" as const },
    ],
    ["a message waiting to send", { queuedWork: "waiting" as const }],
    ["a message that failed to send", { queuedWork: "failed" as const }],
  ])("keeps %s out of the shelves and offers no park action", async (_, overrides) => {
    renderSlot(inbox, listProps, {
      sidebarThreads: {
        status: "ready",
        threads: [thread({ id: "thr_busy", title: "Not done", ...overrides })],
        projects: [{ id: "proj_1", name: "bb", isPersonal: false, href: "", settingsHref: "" }],
      },
      rpc: {
        listLifecycle: () => ({
          rows: [
            {
              threadId: "thr_busy",
              settledAt: 200,
              snoozedUntil: null,
              snoozedAt: null,
            },
          ],
        }),
      },
    });
    expect(await screen.findByText("Not done")).toBeDefined();
    expect(screen.queryByRole("region", { name: "Settled" })).toBeNull();
    expect(screen.queryByLabelText("Settle thread")).toBeNull();
  });

  it("offers Park thread below the snooze times and allows parking again after Undo", async () => {
    const park = vi.fn(() => ({ ok: true, reclaim: SETTLED_NOTHING }));
    const resume = vi.fn(() => ({ ok: true }));
    const rendered = renderSlot(inbox, listProps, {
      sidebarThreads: {
        status: "ready",
        threads: [thread({ id: "thr_park", title: "Quiet" })],
        projects: [{ id: "proj_1", name: "bb", isPersonal: false, href: "", settingsHref: "" }],
      },
      rpc: { listLifecycle: () => ({ rows: [] }), park, resume },
    });
    // Rendered (not merely accepted as props): a card whose park controls
    // never mount leaves the whole feature unreachable.
    expect(await screen.findByLabelText("Settle thread")).toBeDefined();
    const snooze = screen.getByRole("combobox", { name: "Snooze thread" });
    expect(snooze.querySelector('[data-icon="Clock"]')).not.toBeNull();
    expect(snooze.querySelector('[data-icon="ChevronDown"]')).not.toBeNull();
    expect(snooze.classList.contains("[&>svg:last-child]:hidden")).toBe(true);
    expect(snooze.classList.contains("w-5")).toBe(true);
    fireEvent.keyDown(snooze, { key: "Enter" });
    expect(await screen.findByRole("option", { name: "1 hour" })).toBeDefined();
    expect(screen.getByRole("option", { name: "Wait refresh (5 hours)" })).toBeDefined();
    expect(screen.getByRole("option", { name: "This evening" })).toBeDefined();
    expect(screen.getByRole("option", { name: "Next week" })).toBeDefined();
    const menu = screen.getByRole("listbox");
    const parkOption = within(menu).getByRole("option", { name: "Park thread" });
    expect(within(menu).getAllByRole("option").at(-1)).toBe(parkOption);
    fireEvent.click(parkOption);
    await waitFor(() => expect(park).toHaveBeenCalledTimes(1));
    expect(rendered.rpcCalls).toContainEqual({ method: "park", input: { threadId: "thr_park" } });
    expect(rendered.rpcCalls.some((call) => call.method === "snooze" || call.method === "settle")).toBe(false);

    await waitFor(() => expect(toastMocks.success).toHaveBeenCalled());
    const undo = toastMocks.success.mock.calls.find(([message]) => message === "Thread parked")![1].action;
    act(() => undo.onClick());
    await waitFor(() => expect(resume).toHaveBeenCalledTimes(1));
    fireEvent.keyDown(snooze, { key: "Enter" });
    fireEvent.click(await screen.findByRole("option", { name: "Park thread" }));
    await waitFor(() => expect(park).toHaveBeenCalledTimes(2));
  });

  it("keeps status rows actionable through snooze, settle, and unpin controls", async () => {
    const snooze = vi.fn(() => ({ ok: true }));
    const settle = vi.fn(() => ({ ok: true, reclaim: SETTLED_NOTHING }));
    const rendered = renderSlot(inbox, listProps, {
      sidebarThreads: {
        status: "ready",
        threads: [
          thread({
            id: "thr_failed",
            title: "Failed work",
            indicator: "unread-error",
            indicatorLabel: "Failed",
            isPinned: true,
          }),
          thread({
            id: "thr_unread",
            title: "Unread work",
            indicator: "unread-success",
            indicatorLabel: "Unread",
          }),
          thread({
            id: "thr_idle",
            title: "Idle work",
            updatedAt: Date.now() - 2 * 60_000,
          }),
        ],
        projects: [{ id: "proj_1", name: "bb", isPersonal: false, href: "", settingsHref: "" }],
      },
      rpc: { listLifecycle: () => ({ rows: [] }), snooze, settle },
    });

    expect(await screen.findByText("Failed")).toBeDefined();
    expect(screen.getByText("Unread")).toBeDefined();
    expect(screen.getByText(/^\d+m$/)).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "Unpin Failed work" }));
    await waitFor(() =>
      expect(rendered.sidebarActionCalls).toContainEqual({
        method: "setPinned",
        threadId: "thr_failed",
        pinned: false,
      }),
    );

    const unreadRow = screen.getByText("Unread work").closest("li")!;
    fireEvent.click(within(unreadRow).getByRole("button", { name: "Settle thread" }));
    await waitFor(() => expect(settle).toHaveBeenCalledWith({ threadId: "thr_unread" }));

    const idleRow = screen.getByText("Idle work").closest("li")!;
    fireEvent.keyDown(within(idleRow).getByRole("combobox", { name: "Snooze thread" }), { key: "Enter" });
    fireEvent.click(await screen.findByRole("option", { name: "1 hour" }));
    await waitFor(() =>
      expect(snooze).toHaveBeenCalledWith({
        threadId: "thr_idle",
        snoozedUntil: expect.any(Number),
      }),
    );
  });

  it.each([false, true])(
    "folds working threads to one line only when the experiment is on (%s)",
    async (compactWorkingThreads) => {
      renderSlot(inbox, listProps, {
        sidebarThreads: {
          status: "ready",
          threads: [
            thread({ id: "busy", title: "Busy work", indicator: "runtime", indicatorLabel: "Working" }),
            thread({ id: "asking", title: "Asking work", indicator: "runtime", hasPendingInteraction: true }),
            thread({ id: "idle", title: "Idle work" }),
          ],
          projects: [{ id: "proj_1", name: "bb", isPersonal: false, href: "", settingsHref: "" }],
        },
        rpc: {
          // Fixture threads are old; keep them all in Active.
          getSidebarSettings: () => ({
            ...defaultSidebarSettings,
            inactiveThreadsEnabled: false,
            compactWorkingThreads,
          }),
          listLifecycle: () => ({ rows: [] }),
        },
      });
      const card = (title: string) => screen.getByRole("link", { name: title }).closest("[data-parent-card]")!;
      await screen.findByRole("link", { name: "Busy work" });

      await waitFor(() => expect(card("Busy work").classList.contains("h-8")).toBe(compactWorkingThreads));
      expect(card("Asking work").classList.contains("h-8")).toBe(false);
      expect(card("Idle work").classList.contains("h-8")).toBe(false);
      // The folded row keeps bb's spinner and the full label for screen readers.
      expect(card("Busy work").querySelector('[data-icon="Loading"]') !== null).toBe(compactWorkingThreads);
      expect(within(card("Busy work") as HTMLElement).getByText("Working")).toBeDefined();
    },
  );

  it.each([false, true])(
    "keeps a compact row's working children folded until expanded (compact %s)",
    async (compactWorkingThreads) => {
      renderSlot(inbox, listProps, {
        sidebarThreads: {
          status: "ready",
          threads: [
            thread({ id: "parent", title: "Parent work", indicator: "runtime" }),
            thread({ id: "child", parentThreadId: "parent", title: "Child work", indicator: "runtime" }),
          ],
          projects: [{ id: "proj_1", name: "bb", isPersonal: false, href: "", settingsHref: "" }],
        },
        rpc: {
          getSidebarSettings: () => ({
            ...defaultSidebarSettings,
            inactiveThreadsEnabled: false,
            showRunningChildrenWhenCollapsed: true,
            compactWorkingThreads,
          }),
          listLifecycle: () => ({ rows: [] }),
        },
      });
      await screen.findByRole("link", { name: "Parent work" });
      // The full card surfaces a working child; the one-line row does not.
      await waitFor(() => expect(screen.queryByText("Child work") === null).toBe(compactWorkingThreads));

      if (compactWorkingThreads) {
        fireEvent.click(screen.getByRole("button", { name: /1 child thread/ }));
        expect(await screen.findByText("Child work")).toBeDefined();
      }
    },
  );

  it("keeps a row compact until its children and agents are done", async () => {
    renderSlot(inbox, listProps, {
      sidebarThreads: {
        status: "ready",
        threads: [
          thread({ id: "waiting-on-child", title: "Waiting on child" }),
          thread({ id: "child", parentThreadId: "waiting-on-child", title: "Child work", indicator: "runtime" }),
          thread({ id: "asking", title: "Asking parent", hasPendingInteraction: true }),
          thread({ id: "asking-child", parentThreadId: "asking", title: "Asking child", indicator: "runtime" }),
          thread({
            id: "agent",
            title: "Agent parent",
            activity: { workflows: 0, backgroundAgents: 1, backgroundCommands: 0, planMode: 0, goals: 0 },
          }),
          thread({ id: "done", title: "Done parent" }),
          thread({ id: "done-child", parentThreadId: "done", title: "Done child" }),
        ],
        projects: [{ id: "proj_1", name: "bb", isPersonal: false, href: "", settingsHref: "" }],
      },
      rpc: {
        getSidebarSettings: () => ({
          ...defaultSidebarSettings,
          inactiveThreadsEnabled: false,
          compactWorkingThreads: true,
        }),
        listLifecycle: () => ({ rows: [] }),
      },
    });
    const isCompact = (title: string) =>
      screen.getByRole("link", { name: title }).closest("[data-parent-card]")!.classList.contains("h-8");
    await screen.findByRole("link", { name: "Waiting on child" });

    await waitFor(() => expect(isCompact("Waiting on child")).toBe(true));
    expect(isCompact("Agent parent")).toBe(true);
    // The parent's own question outranks its children's work.
    expect(isCompact("Asking parent")).toBe(false);
    expect(isCompact("Done parent")).toBe(false);
  });

  it("counts live descendants despite unread success and keeps requests for input in Active", () => {
    const parent = thread({ id: "parent" });
    const liveChild = thread({ id: "child", parentThreadId: "parent", indicator: "unread-success", status: "active" });
    expect(isWorkingTree(parent, [liveChild], new Map())).toBe(true);
    const askingParent = thread({
      id: "asking",
      indicator: "waiting-for-input",
      activity: {
        workflows: 0,
        backgroundAgents: 1,
        backgroundCommands: 0,
        planMode: 0,
        goals: 0,
      },
    });
    expect(isWorkingTree(askingParent, [], new Map())).toBe(false);
  });

  it("keeps Unpin clickable on a parent compacted by child work", async () => {
    renderSlot(inbox, listProps, {
      sidebarThreads: {
        status: "ready",
        threads: [
          thread({ id: "parent", title: "Pinned parent", isPinned: true }),
          thread({ id: "child", parentThreadId: "parent", indicator: "runtime" }),
        ],
        projects: [{ id: "proj_1", name: "bb", isPersonal: false, href: "", settingsHref: "" }],
      },
      rpc: {
        getSidebarSettings: () => ({ ...defaultSidebarSettings, compactWorkingThreads: true }),
        listLifecycle: () => ({ rows: [] }),
      },
    });
    const button = await screen.findByRole("button", { name: "Unpin Pinned parent" });
    expect(button.classList.contains("pointer-events-auto")).toBe(true);
  });

  it.each([true, false])(
    "moves threads with work running under them to a Working shelf (enabled %s)",
    async (workingShelf) => {
      renderSlot(inbox, listProps, {
        sidebarThreads: {
          status: "ready",
          threads: [
            thread({ id: "busy", title: "Busy work", indicator: "runtime" }),
            thread({ id: "waiting", title: "Waiting on child" }),
            thread({ id: "child", parentThreadId: "waiting", title: "Child work", indicator: "runtime" }),
            thread({ id: "asking", title: "Asking parent", hasPendingInteraction: true }),
            thread({ id: "asking-child", parentThreadId: "asking", title: "Asking child", indicator: "runtime" }),
            thread({ id: "done", title: "Done work", indicator: "unread-success", isUnread: true }),
            thread({ id: "pinned", title: "Pinned busy", indicator: "runtime", isPinned: true }),
          ],
          projects: [{ id: "proj_1", name: "bb", isPersonal: false, href: "", settingsHref: "" }],
        },
        rpc: {
          getSidebarSettings: () => ({
            ...defaultSidebarSettings,
            inactiveThreadsEnabled: false,
            workingShelf,
          }),
          listLifecycle: () => ({ rows: [] }),
        },
      });
      await screen.findByRole("link", { name: "Busy work" });
      const titlesIn = (name: string) =>
        within(screen.getByRole("region", { name }))
          .getAllByRole("link")
          .map((link) => link.getAttribute("aria-label"));

      if (!workingShelf) {
        await waitFor(() => expect(titlesIn("Active")).toContain("Busy work"));
        expect(screen.queryByRole("region", { name: "Working" })).toBeNull();
        return;
      }
      await waitFor(() => expect(titlesIn("Working")).toEqual(["Busy work", "Waiting on child"]));
      // Done, or needing you, is Active's business; pinned stays pinned.
      expect(titlesIn("Active")).toEqual(["Asking parent", "Done work"]);
      expect(titlesIn("Pinned")).toEqual(["Pinned busy"]);
      // One line like the other shelves, even with compact mode off.
      for (const title of ["Busy work", "Waiting on child"]) {
        expect(screen.getByRole("link", { name: title }).closest("[data-parent-card]")!.classList.contains("h-8")).toBe(
          true,
        );
      }
    },
  );

  it.each([true, false])("docks the shelves after Active to the bottom when enabled (%s)", async (dockShelves) => {
    renderSlot(inbox, listProps, {
      sidebarThreads: {
        status: "ready",
        threads: [thread({ id: "open", title: "Open work" }), thread({ id: "done", title: "Settled work" })],
        projects: [{ id: "proj_1", name: "bb", isPersonal: false, href: "", settingsHref: "" }],
      },
      rpc: {
        getSidebarSettings: () => ({
          ...defaultSidebarSettings,
          inactiveThreadsEnabled: false,
          dockShelves,
        }),
        listLifecycle: () => ({
          rows: [
            {
              threadId: "done",
              settledAt: Date.now(),
              settledOverride: "settled",
              snoozedUntil: null,
              snoozedAt: null,
            },
          ],
        }),
      },
    });
    const settled = await screen.findByRole("region", { name: "Settled" });
    const active = screen.getByRole("region", { name: "Active" });
    await waitFor(() => expect(settled.closest("[data-shelf-dock]") !== null).toBe(dockShelves));
    // Active never moves into the dock; it scrolls in the space above.
    expect(active.closest("[data-shelf-dock]")).toBeNull();
  });

  it("snoozes to a picked date and time from the snooze menu", async () => {
    const snooze = vi.fn(() => ({ ok: true }));
    renderSlot(inbox, listProps, {
      sidebarThreads: {
        status: "ready",
        threads: [thread({ id: "thr_pick", title: "Later work" })],
        projects: [{ id: "proj_1", name: "bb", isPersonal: false, href: "", settingsHref: "" }],
      },
      rpc: { listLifecycle: () => ({ rows: [] }), snooze },
    });

    fireEvent.keyDown(await screen.findByRole("combobox", { name: "Snooze thread" }), { key: "Enter" });
    fireEvent.click(await screen.findByRole("option", { name: "Pick date & time…" }));
    const dialog = await screen.findByRole("dialog", { name: "Snooze until" });
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    expect(within(dialog).getByText(/^Wakes /)).toBeDefined();

    const time = within(dialog).getByLabelText("Time");
    fireEvent.change(time, { target: { value: "" } });
    expect(within(dialog).getByText("Enter a time.")).toBeDefined();
    expect(within(dialog).getByRole("button", { name: "Snooze" }).hasAttribute("disabled")).toBe(true);

    fireEvent.change(time, { target: { value: "16:45" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Snooze" }));
    await waitFor(() =>
      expect(snooze).toHaveBeenCalledWith({
        threadId: "thr_pick",
        snoozedUntil: new Date(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate(), 16, 45).getTime(),
      }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  // jsdom cannot evaluate `@media (hover: none)`, so the regression this
  // guards — a touch layout that faded the status out behind the park actions
  // — only shows in the class contract. The structural half is asserted too:
  // status and actions are rendered together, and neither is hidden.
  it("keeps the status beside the touch park actions instead of fading it out", async () => {
    const minute = Math.floor(Date.now() / 60_000) * 60_000;
    const parkable = [
      ["Touch failed", "unread-error", "Failed"],
      ["Touch unread", "unread-success", "Unread"],
      // A question bb reports without a pending interaction is still parkable.
      ["Touch asked", "waiting-for-input", "Needs you"],
      ["Touch idle", "none", "4m"],
    ] as const;
    renderSlot(inbox, listProps, {
      sidebarThreads: {
        status: "ready",
        threads: parkable.map(([title, indicator]) =>
          thread({
            id: title,
            title,
            indicator,
            updatedAt: minute - 4 * 60_000,
          }),
        ),
        projects: [{ id: "proj_1", name: "bb", isPersonal: false, href: "", settingsHref: "" }],
      },
      rpc: { listLifecycle: () => ({ rows: [] }) },
    });

    await screen.findByText("Touch failed");
    for (const [title, , statusText] of parkable) {
      const row = screen.getByText(title).closest("li")!;
      // The actions the touch layout has to sit beside, not on top of.
      expect(within(row).getByRole("combobox", { name: "Snooze thread" })).toBeDefined();
      expect(within(row).getByRole("button", { name: "Settle thread" })).toBeDefined();
      // The card's anchor is a sibling of the controls, not their ancestor.
      expect(nestedInteractiveControls(row)).toEqual([]);

      const { status, statusWrapper, slot, actions } = statusSlotParts(row, statusText);
      expect(actions).not.toBe(statusWrapper);
      expect(status.getAttribute("aria-hidden")).toBeNull();
      expect(status.hasAttribute("hidden")).toBe(false);
      expect(statusWrapper.getAttribute("aria-hidden")).toBeNull();
      // Touch: both spans return to the flow at full opacity, and the slot
      // widens so they sit side by side instead of stacked.
      for (const className of ["[@media(hover:none)]:static", "[@media(hover:none)]:opacity-100"]) {
        expect(statusWrapper.className).toContain(className);
        expect(actions.className).toContain(className);
      }
      expect(slot.className).toContain("[@media(hover:none)]:w-auto");
      expect(slot.className).toContain("[@media(hover:none)]:gap-1.5");
      expect(statusWrapper.className).not.toContain("[@media(hover:none)]:opacity-0");
      // A hover device still trades the status for the actions.
      expect(statusWrapper.className).toContain("[@media(hover:hover)]:group-hover/card:opacity-0");
    }
  });

  // Opening the snooze menu pins the actions open on a hover device by hiding
  // the status. On touch the two already share the row, so the status stays.
  it("keeps the touch status visible while the snooze menu is open", async () => {
    renderSlot(inbox, listProps, {
      sidebarThreads: {
        status: "ready",
        threads: [thread({ id: "thr_open", title: "Menu open", indicator: "unread-error" })],
        projects: [{ id: "proj_1", name: "bb", isPersonal: false, href: "", settingsHref: "" }],
      },
      rpc: { listLifecycle: () => ({ rows: [] }) },
    });

    const row = (await screen.findByText("Menu open")).closest("li")!;
    fireEvent.keyDown(within(row).getByRole("combobox", { name: "Snooze thread" }), { key: "Enter" });
    await screen.findByRole("option", { name: "1 hour" });

    const { statusWrapper } = statusSlotParts(row, "Failed");
    expect(within(row).getByText("Failed")).toBeDefined();
    expect(statusWrapper.className).toContain("opacity-0");
    expect(statusWrapper.className).toContain("[@media(hover:none)]:opacity-100");
  });

  // A working or blocked thread cannot be parked, so it has no actions to
  // share the slot with — but it must still show its status on touch.
  it("keeps the status on rows that offer no park actions", async () => {
    const now = Math.floor(Date.now() / 60_000) * 60_000;
    window.localStorage.setItem("bb-sidebar:working-since:v1", JSON.stringify({ thr_working: now - 5 * 60_000 }));
    renderSlot(inbox, listProps, {
      sidebarThreads: {
        status: "ready",
        threads: [
          thread({
            id: "thr_working",
            title: "Still working",
            indicator: "runtime",
            indicatorLabel: "Agent is working",
            updatedAt: now,
          }),
          thread({
            id: "thr_pending",
            title: "Still asking",
            hasPendingInteraction: true,
            indicator: "waiting-for-input",
            updatedAt: now,
          }),
        ],
        projects: [{ id: "proj_1", name: "bb", isPersonal: false, href: "", settingsHref: "" }],
      },
      rpc: { listLifecycle: () => ({ rows: [] }) },
    });

    await screen.findByText("Still working");
    for (const [title, statusText] of [
      ["Still working", "Working · 5m"],
      ["Still asking", "Needs you"],
    ] as const) {
      const row = screen.getByText(title).closest("li")!;
      expect(within(row).queryByRole("combobox", { name: "Snooze thread" })).toBeNull();
      expect(within(row).queryByRole("button", { name: "Settle thread" })).toBeNull();
      const { status, statusWrapper, slot } = statusSlotParts(row, statusText);
      expect(status.getAttribute("aria-hidden")).toBeNull();
      expect(statusWrapper.className).not.toContain("opacity-0");
      // Intrinsic width with a floor: nothing is layered over the status.
      expect(slot.className).toContain("w-auto");
      expect(slot.className).toContain("min-w-20");
    }
  });

  it("settles a thread when the user clicks Settle", async () => {
    let settled: string | null = null;
    renderSlot(inbox, listProps, {
      sidebarThreads: {
        status: "ready",
        threads: [thread({ id: "thr_park", title: "Quiet" })],
        projects: [{ id: "proj_1", name: "bb", isPersonal: false, href: "", settingsHref: "" }],
      },
      rpc: {
        listLifecycle: () => ({ rows: [] }),
        settle: (input) => {
          settled = (input as { threadId: string }).threadId;
          return { ok: true, reclaim: SETTLED_NOTHING };
        },
      },
    });
    fireEvent.click(await screen.findByLabelText("Settle thread"));
    await waitFor(() => expect(settled).toBe("thr_park"));
  });

  it("plays the settle sweep before settling, unless motion is reduced", async () => {
    for (const reduced of [false, true]) {
      vi.stubGlobal("matchMedia", (query: string) => ({
        matches: reduced && query.includes("reduce"),
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      }));
      onTestFinished(() => {
        vi.unstubAllGlobals();
      });
      let settled: string | null = null;
      const rendered = renderSlot(inbox, listProps, {
        sidebarThreads: {
          status: "ready",
          threads: [thread({ id: "thr_park", title: "Quiet" })],
          projects: [{ id: "proj_1", name: "bb", isPersonal: false, href: "", settingsHref: "" }],
        },
        rpc: {
          listLifecycle: () => ({ rows: [] }),
          settle: (input) => {
            settled = (input as { threadId: string }).threadId;
            return { ok: true, reclaim: SETTLED_NOTHING };
          },
        },
      });
      const button = await screen.findByLabelText("Settle thread");
      fireEvent.click(button);
      const card = button.closest("[data-parent-card]")!;
      if (reduced) {
        expect(card.hasAttribute("data-settling")).toBe(false);
      } else {
        expect(card.hasAttribute("data-settling")).toBe(true);
        expect(card.querySelector(".bb-sidebar-settle-sweep")).not.toBeNull();
        // A second click while the sweep plays is not a second settle.
        fireEvent.click(button);
        expect(settled).toBeNull();
      }
      await waitFor(() => expect(settled).toBe("thr_park"));
      rendered.unmount();
    }
  });

  // A raised hand outranks a reported runtime in the slot, and it also
  // outranks any stored shelf: the row stays on Active with no park controls.
  it("prefers a pending question to a running indicator on a parent card", async () => {
    const now = Math.floor(Date.now() / 60_000) * 60_000;
    window.localStorage.setItem("bb-sidebar:working-since:v1", JSON.stringify({ thr_ask: now - 5 * 60_000 }));
    renderSlot(inbox, listProps, {
      sidebarThreads: {
        status: "ready",
        threads: [
          thread({
            id: "thr_ask",
            title: "Asking while working",
            hasPendingInteraction: true,
            indicator: "runtime",
            indicatorLabel: "Agent is working",
            updatedAt: now,
          }),
        ],
        projects: [{ id: "proj_1", name: "bb", isPersonal: false, href: "", settingsHref: "" }],
      },
      // Settled in the store, but a raised hand brings it straight back.
      rpc: {
        listLifecycle: () => ({
          rows: [
            {
              threadId: "thr_ask",
              settledAt: 200,
              snoozedUntil: null,
              snoozedAt: null,
            },
          ],
        }),
      },
    });

    const active = screen.getByRole("region", { name: "Active" });
    const row = (await within(active).findByText("Asking while working")).closest("li")!;
    expect(within(row).getByText("Needs you")).toBeDefined();
    expect(within(row).queryByText(/^Working/)).toBeNull();
    expect(within(row).getByLabelText("Needs you")).toBeDefined();
    expect(within(row).queryByLabelText("Agent is working")).toBeNull();
    expect(screen.queryByRole("region", { name: "Settled" })).toBeNull();
  });

  // Parked rows share the status vocabulary: a settled thread that failed
  // says so rather than falling back to its age.
  it("shows a settled row's status instead of its age", async () => {
    const now = Date.now();
    renderSlot(inbox, listProps, {
      sidebarThreads: {
        status: "ready",
        threads: [
          thread({
            id: "thr_settled",
            title: "Settled failure",
            indicator: "unread-error",
            indicatorLabel: "Unread thread failed",
            updatedAt: now - (3 * 3_600_000 + 60_000),
            createdAt: now - (3 * 3_600_000 + 60_000),
            latestAttentionAt: now - (3 * 3_600_000 + 60_000),
          }),
        ],
        projects: [{ id: "proj_1", name: "bb", isPersonal: false, href: "", settingsHref: "" }],
      },
      rpc: {
        listLifecycle: () => ({
          rows: [
            {
              threadId: "thr_settled",
              settledAt: now,
              snoozedUntil: null,
              snoozedAt: null,
            },
          ],
        }),
      },
    });

    const shelf = await screen.findByRole("region", { name: "Settled" });
    fireEvent.click(within(shelf).getByRole("button", { expanded: false }));
    const row = within(shelf).getByText("Settled failure").closest("li")!;
    expect(within(row).getByText("Failed").className).toContain("text-[color:var(--bb-sidebar-tone-error)]");
    expect(within(row).queryByText("3h")).toBeNull();
    expect(within(row).getByRole("button", { name: "Un-settle thread" })).toBeDefined();
  });

  it("keeps the last usable view when lifecycle refresh fails", async () => {
    renderSlot(inbox, listProps, {
      sidebarThreads: {
        status: "ready",
        threads: [thread({ id: "thr_available", title: "Still available" })],
        projects: [{ id: "proj_1", name: "bb", isPersonal: false, href: "", settingsHref: "" }],
      },
      rpc: {
        listLifecycle: () => Promise.reject(new Error("backend reloading")),
      },
    });

    expect(screen.getByText("Still available")).toBeDefined();
    await waitFor(() => expect(screen.getByText("Still available")).toBeDefined());
  });

  it("shows the wake countdown on a snoozed row", async () => {
    const wakeAt = Date.now() + 2 * 60 * 60 * 1000;
    renderSlot(inbox, listProps, {
      sidebarThreads: {
        status: "ready",
        threads: [thread({ id: "thr_snz", title: "Later" })],
        projects: [{ id: "proj_1", name: "bb", isPersonal: false, href: "", settingsHref: "" }],
      },
      rpc: {
        listLifecycle: () => ({
          rows: [
            {
              threadId: "thr_snz",
              settledAt: null,
              snoozedUntil: wakeAt,
              snoozedAt: Date.now(),
            },
          ],
        }),
      },
    });
    const shelf = await screen.findByRole("region", { name: "Snoozed" });
    fireEvent.click(within(shelf).getByRole("button"));
    expect(within(shelf).getByText("2h")).toBeDefined();
    expect(within(shelf).getByLabelText("bb · Later")).toBeDefined();
    expect(within(shelf).getByText("bb").className).toContain("text-muted-foreground/50");
    expect(within(shelf).getByText("·").className).toContain("text-sm");
    expect(within(shelf).getByText("Later").className).toContain("text-foreground/80");
    expect(within(shelf).getByLabelText("Wake thread now")).toBeDefined();
  });

  it("persists each shelf's expanded state across remounts", async () => {
    const now = Date.now();
    const rows = [
      {
        threadId: "thr_done",
        settledAt: 200,
        snoozedUntil: null,
        snoozedAt: null,
      },
      {
        threadId: "thr_later",
        settledAt: null,
        snoozedUntil: now + 60_000,
        snoozedAt: now,
      },
    ];
    const options = {
      sidebarThreads: {
        status: "ready" as const,
        threads: [
          thread({ id: "thr_active", title: "Active work", updatedAt: now }),
          thread({
            id: "thr_inactive",
            title: "Inactive work",
            updatedAt: now - 7 * 60 * 60 * 1_000,
          }),
          thread({ id: "thr_done", title: "Finished work" }),
          thread({ id: "thr_later", title: "Later work" }),
        ],
        projects: [{ id: "proj_1", name: "bb", isPersonal: false, href: "", settingsHref: "" }],
      },
      settings: {
        inactiveThreadsEnabled: true,
        inactiveAfterHours: "6",
      },
      rpc: { listLifecycle: () => ({ rows }) },
    };

    renderSlot(inbox, listProps, options);
    let activeShelf = screen.getByRole("region", { name: "Active" });
    let inactiveShelf = screen.getByRole("region", { name: "Inactive" });
    let settledShelf = await screen.findByRole("region", { name: "Settled" });
    let snoozedShelf = await screen.findByRole("region", { name: "Snoozed" });
    fireEvent.click(within(activeShelf).getByRole("button", { expanded: true }));
    fireEvent.click(within(inactiveShelf).getByRole("button"));
    fireEvent.click(within(settledShelf).getByRole("button", { expanded: false }));
    fireEvent.click(within(snoozedShelf).getByRole("button"));
    expect(within(activeShelf).queryByText("Active work")).toBeNull();
    expect(within(inactiveShelf).getByText("Inactive work")).toBeDefined();
    expect(within(settledShelf).getByText("Finished work")).toBeDefined();
    expect(within(snoozedShelf).getByText("Later work")).toBeDefined();

    cleanup();
    renderSlot(inbox, listProps, options);
    activeShelf = screen.getByRole("region", { name: "Active" });
    inactiveShelf = screen.getByRole("region", { name: "Inactive" });
    settledShelf = await screen.findByRole("region", { name: "Settled" });
    snoozedShelf = await screen.findByRole("region", { name: "Snoozed" });
    expect(within(activeShelf).getByRole("button", { expanded: false })).toBeDefined();
    expect(within(inactiveShelf).getByRole("button", { expanded: true })).toBeDefined();
    expect(within(settledShelf).getByRole("button", { expanded: true })).toBeDefined();
    expect(within(snoozedShelf).getByRole("button", { expanded: true })).toBeDefined();
    expect(within(activeShelf).queryByText("Active work")).toBeNull();
    expect(within(inactiveShelf).getByText("Inactive work")).toBeDefined();
    expect(within(settledShelf).getByText("Finished work")).toBeDefined();
    expect(within(snoozedShelf).getByText("Later work")).toBeDefined();
  });

  it("does not flash inactive and parked threads as Active after an app restart", async () => {
    const now = Date.now();
    const pendingSettings = deferred<typeof defaultSidebarSettings>();
    const pendingLifecycle = deferred<{
      rows: Array<{
        threadId: string;
        settledAt: number;
        snoozedUntil: null;
        snoozedAt: null;
      }>;
    }>();
    const props = { ...listProps };
    const sidebarThreads = {
      status: "ready" as const,
      threads: [
        thread({
          id: "inactive",
          title: "Inactive work",
          updatedAt: now - 7 * 60 * 60 * 1_000,
        }),
        thread({ id: "settled", title: "Settled work" }),
      ],
      projects: [{ id: "proj_1", name: "bb", isPersonal: false, href: "", settingsHref: "" }],
    };
    renderSlot(inbox, props, {
      sidebarThreads,
      rpc: {
        getSidebarSettings: () => defaultSidebarSettings,
        listLifecycle: () => ({
          rows: [
            {
              threadId: "settled",
              settledAt: now,
              snoozedUntil: null,
              snoozedAt: null,
            },
          ],
        }),
      },
    });

    await screen.findByRole("region", { name: "Inactive" });
    await screen.findByRole("region", { name: "Settled" });
    cleanup();

    renderSlot(inbox, props, {
      sidebarThreads,
      rpc: {
        getSidebarSettings: () => pendingSettings.promise,
        listLifecycle: () => pendingLifecycle.promise,
      },
    });

    const inactiveShelf = screen.getByRole("region", { name: "Inactive" });
    const settledShelf = screen.getByRole("region", { name: "Settled" });
    expect(within(inactiveShelf).getByRole("button", { expanded: false })).toBeDefined();
    expect(within(settledShelf).getByRole("button", { expanded: false })).toBeDefined();
    expect(screen.queryByRole("region", { name: "Active" })).toBeNull();
    expect(screen.queryByText("Inactive work")).toBeNull();
    expect(screen.queryByText("Settled work")).toBeNull();
  });

  it("keeps the currently open parked row visible while collapsed", async () => {
    renderSlot(
      inbox,
      { ...listProps, activeThreadId: "thr_open" },
      {
        sidebarThreads: {
          status: "ready",
          threads: [thread({ id: "thr_open", title: "Open but settled" })],
          projects: [{ id: "proj_1", name: "bb", isPersonal: false, href: "", settingsHref: "" }],
        },
        rpc: {
          listLifecycle: () => ({
            rows: [
              {
                threadId: "thr_open",
                settledAt: 200,
                snoozedUntil: null,
                snoozedAt: null,
              },
            ],
          }),
        },
      },
    );

    const shelf = await screen.findByRole("region", { name: "Settled" });
    expect(within(shelf).getByRole("button", { expanded: false })).toBeDefined();
    expect(within(shelf).getByText("Open but settled")).toBeDefined();
  });

  it("sorts snoozed rows by soonest wake and settled rows by settle time", async () => {
    const now = Date.now();
    renderSlot(inbox, listProps, {
      sidebarThreads: {
        status: "ready",
        threads: [
          thread({ id: "later", title: "Later wake", createdAt: 100 }),
          thread({ id: "sooner", title: "Sooner wake", createdAt: 1 }),
          thread({ id: "old-settle", title: "Older settle", createdAt: 999 }),
          thread({ id: "new-settle", title: "Newer settle", createdAt: 1 }),
        ],
        projects: [{ id: "proj_1", name: "bb", isPersonal: false, href: "", settingsHref: "" }],
      },
      rpc: {
        listLifecycle: () => ({
          rows: [
            { threadId: "later", settledAt: null, snoozedUntil: now + 5_000, snoozedAt: now },
            { threadId: "sooner", settledAt: null, snoozedUntil: now + 1_000, snoozedAt: now },
            { threadId: "old-settle", settledAt: 500, snoozedUntil: null, snoozedAt: null },
            { threadId: "new-settle", settledAt: 900, snoozedUntil: null, snoozedAt: null },
          ],
        }),
      },
    });

    const snoozedShelf = await screen.findByRole("region", { name: "Snoozed" });
    const settledShelf = await screen.findByRole("region", { name: "Settled" });
    fireEvent.click(within(snoozedShelf).getByRole("button"));
    fireEvent.click(within(settledShelf).getByRole("button", { expanded: false }));
    expect(
      within(snoozedShelf)
        .getAllByRole("listitem")
        .map((row) => row.textContent),
    ).toEqual([expect.stringContaining("Sooner wake"), expect.stringContaining("Later wake")]);
    expect(
      within(settledShelf)
        .getAllByRole("listitem")
        .map((row) => row.textContent),
    ).toEqual([expect.stringContaining("Newer settle"), expect.stringContaining("Older settle")]);
  });

  it("shows 10 settled rows initially and loads 25 more at a time", async () => {
    const threads = Array.from({ length: 36 }, (_, index) =>
      thread({ id: `settled-${index}`, title: `Settled ${index}` }),
    );
    renderSlot(inbox, listProps, {
      sidebarThreads: {
        status: "ready",
        threads,
        projects: [{ id: "proj_1", name: "bb", isPersonal: false, href: "", settingsHref: "" }],
      },
      rpc: {
        listLifecycle: () => ({
          rows: threads.map((candidate, index) => ({
            threadId: candidate.id,
            settledAt: 1_000 - index,
            snoozedUntil: null,
            snoozedAt: null,
          })),
        }),
      },
    });

    const shelf = await screen.findByRole("region", { name: "Settled" });
    fireEvent.click(within(shelf).getByRole("button", { expanded: false }));
    expect(within(shelf).getAllByRole("listitem")).toHaveLength(10);
    fireEvent.click(within(shelf).getByRole("button", { name: "Load 25 more" }));
    expect(within(shelf).getAllByRole("listitem")).toHaveLength(35);
    fireEvent.click(within(shelf).getByRole("button", { name: "Load 1 more" }));
    expect(within(shelf).getAllByRole("listitem")).toHaveLength(36);
    expect(within(shelf).queryByText(/Load .* more/)).toBeNull();
  });

  it("keeps Woke beside the current card status and preserves its controls", async () => {
    const acknowledged: string[] = [];
    const now = Math.floor(Date.now() / 60_000) * 60_000;
    window.localStorage.setItem("bb-sidebar:working-since:v1", JSON.stringify({ runtime: now - 5 * 60_000 }));
    const threads = [
      thread({
        id: "pending",
        title: "Pending wake",
        indicator: "waiting-for-input",
        hasPendingInteraction: true,
      }),
      thread({
        id: "failed",
        title: "Failed wake",
        indicator: "unread-error",
        isPinned: true,
      }),
      thread({ id: "runtime", title: "Runtime wake", indicator: "runtime" }),
      thread({
        id: "idle",
        title: "Idle wake",
        updatedAt: now - 31 * 60_000,
      }),
    ];
    let lifecycleRows = threads.map((candidate) => ({
      threadId: candidate.id,
      settledAt: null,
      snoozedUntil: candidate.id === "pending" ? now + 60_000 : now - 1,
      snoozedAt: now - 60_000,
    }));
    const rendered = renderSlot(inbox, listProps, {
      sidebarThreads: {
        status: "ready",
        threads,
        projects: [{ id: "proj_1", name: "A very long project name", isPersonal: false, href: "", settingsHref: "" }],
      },
      rpc: {
        listLifecycle: () => ({ rows: lifecycleRows }),
        acknowledgeWake: (input) => {
          const threadId = (input as { threadId: string }).threadId;
          acknowledged.push(threadId);
          lifecycleRows = lifecycleRows.filter((row) => row.threadId !== threadId);
          return { ok: true };
        },
      },
    });

    const expected = [
      ["Pending wake", "Needs you"],
      ["Failed wake", "Failed"],
      ["Runtime wake", "Working · 5m"],
      ["Idle wake", "31m"],
    ] as const;
    for (const [title, status] of expected) {
      const row = (await screen.findByText(title)).closest("li")!;
      expect(within(row).getByRole("button", { name: "Dismiss Woke marker" })).toBeDefined();
      expect(within(row).getByText(status)).toBeDefined();
    }

    const pendingRow = screen.getByText("Pending wake").closest("li")!;
    fireEvent.click(within(pendingRow).getByRole("button", { name: "Dismiss Woke marker" }));
    await waitFor(() => expect(acknowledged).toEqual(["pending"]));
    await rendered.emitRealtime("lifecycle", {});
    await waitFor(() =>
      expect(
        within(screen.getByText("Pending wake").closest("li")!).queryByRole("button", { name: "Dismiss Woke marker" }),
      ).toBeNull(),
    );
    expect(within(screen.getByText("Pending wake").closest("li")!).getByText("Needs you")).toBeDefined();
    expect(rendered.sidebarActionCalls.some((call) => call.method === "open")).toBe(false);

    const failedRow = screen.getByText("Failed wake").closest("li")!;
    fireEvent.click(within(failedRow).getByRole("button", { name: "Unpin Failed wake" }));
    await waitFor(() =>
      expect(rendered.sidebarActionCalls).toContainEqual({
        method: "setPinned",
        threadId: "failed",
        pinned: false,
      }),
    );
    expect(acknowledged).toEqual(["pending"]);
    expect(within(failedRow).getByText("Failed")).toBeDefined();

    fireEvent.click(within(failedRow).getByRole("link", { name: "Failed wake" }));
    await waitFor(() => expect(acknowledged).toEqual(["pending", "failed"]));
    expect(rendered.sidebarActionCalls).toContainEqual({
      method: "open",
      threadId: "failed",
      options: { split: false },
    });
  });
  // Dismissing the marker is a correction, not navigation: the row stays put
  // with its real status, and nothing opens.
  it("dismisses the Woke marker without opening or navigating", async () => {
    const acknowledged: string[] = [];
    let navigated = 0;
    const now = Math.floor(Date.now() / 60_000) * 60_000;
    let lifecycleRows = [
      {
        threadId: "woke",
        settledAt: null,
        snoozedUntil: now - 1,
        snoozedAt: now - 60_000,
      },
    ];
    const rendered = renderSlot(
      inbox,
      { ...listProps, onNavigate: () => (navigated += 1) },
      {
        sidebarThreads: {
          status: "ready",
          threads: [
            thread({
              id: "woke",
              title: "Woke work",
              indicator: "unread-error",
              indicatorLabel: "Unread thread failed",
              updatedAt: now,
            }),
          ],
          projects: [{ id: "proj_1", name: "bb", isPersonal: false, href: "", settingsHref: "" }],
        },
        rpc: {
          listLifecycle: () => ({ rows: lifecycleRows }),
          acknowledgeWake: (input) => {
            acknowledged.push((input as { threadId: string }).threadId);
            lifecycleRows = [];
            return { ok: true };
          },
        },
      },
    );

    const row = (await screen.findByText("Woke work")).closest("li")!;
    const dismiss = within(row).getByRole("button", {
      name: "Dismiss Woke marker",
    });
    expect(within(row).getByText("Failed")).toBeDefined();
    // The card's navigation anchor is a sibling of the controls, never their
    // ancestor, so no control ends up inside another control.
    expect(dismiss.closest("a")).toBeNull();
    expect(nestedInteractiveControls(row)).toEqual([]);

    fireEvent.click(dismiss);
    await waitFor(() => expect(acknowledged).toEqual(["woke"]));
    expect(navigated).toBe(0);
    expect(rendered.sidebarActionCalls).toEqual([]);

    await rendered.emitRealtime("lifecycle", {});
    const settled = () => screen.getByText("Woke work").closest("li")!;
    await waitFor(() =>
      expect(
        within(settled()).queryByRole("button", {
          name: "Dismiss Woke marker",
        }),
      ).toBeNull(),
    );
    expect(within(settled()).getByText("Failed")).toBeDefined();
    expect(navigated).toBe(0);
  });
});

describe("row context menu", () => {
  it("offers the plugin's own thread actions on right-click", async () => {
    render([thread({ id: "thr_menu", title: "Right click me" })]);
    const row = await screen.findByText("Right click me");
    fireEvent.contextMenu(row);
    const menu = await screen.findByRole("menu", { name: "Thread actions" });
    // The plugin builds this menu itself — the SDK ships no menu component —
    // so the items are this plugin's choice, backed by the action hook.
    expect(
      within(menu)
        .getAllByRole("menuitem")
        .map((item) => item.textContent),
    ).toEqual([
      "Open in split",
      "Parent",
      "Project",
      "Pin",
      "Snooze",
      "Park thread",
      "Settle",
      "Rename",
      "Regenerate title",
      "Mark unread",
      "Copy",
      "Archive",
      "Delete",
    ]);
    expect(within(menu).getAllByRole("separator")).toHaveLength(4);
  });

  describe.each(parkingActions)("%s navigation", (action) => {
    it("updates another thread from the context menu without changing the open thread", async () => {
      let settled: string | null = null;
      const rendered = renderSlot(
        inbox,
        { ...listProps, activeThreadId: "open" },
        {
          sidebarThreads: {
            status: "ready",
            threads: [
              thread({ id: "thr_settle", title: "Settle from menu" }),
              thread({ id: "open", title: "Stay here" }),
            ],
            projects: [{ id: "proj_1", name: "bb", isPersonal: false, href: "", settingsHref: "" }],
          },
          rpc: {
            listLifecycle: () => ({ rows: [] }),
            [action]: (input) => {
              settled = (input as { threadId: string }).threadId;
              return { ok: true, reclaim: SETTLED_NOTHING };
            },
          },
        },
      );

      await parkFromMenu(await screen.findByText("Settle from menu"), action);
      await waitFor(() => expect(settled).toBe("thr_settle"));
      await waitFor(() => expect(toastMocks.success).toHaveBeenCalled());
      expect(rendered.sidebarActionCalls).toEqual([]);
    });

    it("opens the next Active thread when leaving its first row", async () => {
      let navigated = 0;
      const rendered = renderSlot(
        inbox,
        {
          ...listProps,
          activeThreadId: "current",
          onNavigate: () => (navigated += 1),
        },
        {
          sidebarThreads: {
            status: "ready",
            threads: [
              thread({ id: "current", title: "Current", createdAt: 20 }),
              thread({ id: "next", title: "Next", createdAt: 10 }),
            ],
            projects: [{ id: "proj_1", name: "bb", isPersonal: false, href: "", settingsHref: "" }],
          },
          rpc: {
            listLifecycle: () => ({ rows: [] }),
            [action]: () => ({ ok: true, reclaim: SETTLED_NOTHING }),
          },
        },
      );

      await parkFromMenu(await screen.findByText("Current"), action);
      await waitFor(() =>
        expect(rendered.sidebarActionCalls).toContainEqual({
          method: "open",
          threadId: "next",
        }),
      );
      expect(navigated).toBe(1);
    });

    it.each([
      ["manual", "manual", false],
      ["manual", "manual", true],
      ["created", "created", true],
      ["activity", "activity", true],
      // The first project unit always starts with the first manual thread.
      ["project", "manual", true],
    ] as const)(
      "leaving a thread in %s order opens %s first with Active collapsed: %s",
      async (mode, expectedId, collapsed) => {
        localStorage.setItem("bb-sidebar:active-sort:v1", mode);
        const order = ["manual", "current", "created", "activity", "project"];
        localStorage.setItem("bb-sidebar:inbox-order-cache:v1", JSON.stringify(order));
        const rendered = renderSlot(
          inbox,
          { ...listProps, activeThreadId: "current" },
          {
            sidebarThreads: {
              status: "ready",
              threads: [
                thread({ id: "current", title: "Current", createdAt: 50, updatedAt: 50 }),
                thread({ id: "manual", title: "Manual first", createdAt: 20, updatedAt: 20 }),
                thread({ id: "created", title: "Newest first", createdAt: 100, updatedAt: 100 }),
                thread({ id: "activity", title: "Recent first", createdAt: 10, updatedAt: 200 }),
                thread({ id: "project", title: "Alpha first", projectId: "alpha", createdAt: 5 }),
              ],
              projects: [
                { id: "proj_1", name: "Zulu", isPersonal: false, href: "", settingsHref: "" },
                { id: "alpha", name: "Alpha", isPersonal: false, href: "", settingsHref: "" },
              ],
            },
            rpc: {
              listLifecycle: () => ({ rows: [] }),
              listInboxOrder: () => ({ inboxThreadIds: order }),
              [action]: () => ({ ok: true, reclaim: SETTLED_NOTHING }),
            },
          },
        );

        const active = await screen.findByRole("region", { name: "Active" });
        if (collapsed) {
          fireEvent.click(within(active).getByRole("button", { name: "Active", expanded: true }));
        }
        const current = within(active).getByText("Current").closest("li")!;
        await parkFromCard(current, action);
        await waitFor(() =>
          expect(rendered.sidebarActionCalls).toContainEqual({
            method: "open",
            threadId: expectedId,
          }),
        );
      },
    );

    it.each([
      ["current", "first-pin"],
      ["first-pin", "second-pin"],
    ])("leaving %s selects %s before Active, using the full pinned order", async (currentId, expectedId) => {
      localStorage.setItem("bb-sidebar:active-sort:v1", "created");
      const rendered = renderSlot(
        inbox,
        { ...listProps, activeThreadId: currentId },
        {
          sidebarThreads: {
            status: "ready",
            threads: [
              thread({ id: "first-pin", title: "First pin", isPinned: true, createdAt: 10 }),
              thread({ id: "second-pin", title: "Second pin", isPinned: true, createdAt: 100 }),
              thread({ id: "current", title: "Current", createdAt: 20 }),
              thread({ id: "active", title: "First active", createdAt: 200 }),
            ],
            projects: [{ id: "proj_1", name: "bb", isPersonal: false, href: "", settingsHref: "" }],
          },
          rpc: {
            listLifecycle: () => ({ rows: [] }),
            [action]: () => ({ ok: true, reclaim: SETTLED_NOTHING }),
          },
        },
      );

      const pinned = await screen.findByRole("region", { name: "Pinned" });
      fireEvent.click(within(pinned).getByRole("button", { expanded: true }));
      const current = screen.getByText(currentId === "current" ? "Current" : "First pin").closest("li")!;
      await parkFromCard(current, action);
      await waitFor(() =>
        expect(rendered.sidebarActionCalls).toContainEqual({
          method: "open",
          threadId: expectedId,
        }),
      );
    });

    it("selects the first Active thread when leaving the last Pinned thread", async () => {
      const rendered = renderSlot(
        inbox,
        { ...listProps, activeThreadId: "pinned" },
        {
          sidebarThreads: {
            status: "ready",
            threads: [
              thread({ id: "pinned", title: "Last pin", isPinned: true }),
              thread({ id: "first", title: "First active", createdAt: 20 }),
              thread({ id: "last", title: "Last active", createdAt: 10 }),
            ],
            projects: [{ id: "proj_1", name: "bb", isPersonal: false, href: "", settingsHref: "" }],
          },
          rpc: {
            listLifecycle: () => ({ rows: [] }),
            [action]: () => ({ ok: true, reclaim: SETTLED_NOTHING }),
          },
        },
      );

      const pinned = await screen.findByRole("region", { name: "Pinned" });
      await parkFromCard(within(pinned).getByText("Last pin").closest("li")!, action);
      await waitFor(() =>
        expect(rendered.sidebarActionCalls).toContainEqual({
          method: "open",
          threadId: "first",
        }),
      );
    });

    it.each([false, true])(
      "opens a project-scoped composer when Pinned and Active are empty after the action, with the last thread pinned: %s",
      async (isPinned) => {
        const now = Date.now();
        const rendered = renderSlot(
          inbox,
          { ...listProps, activeThreadId: "only" },
          {
            sidebarThreads: {
              status: "ready",
              threads: [
                thread({ id: "only", title: "Only thread", updatedAt: now, isPinned }),
                thread({ id: "inactive", title: "Inactive thread" }),
                thread({ id: "parked", title: "Parked thread" }),
                thread({ id: "snoozed", title: "Snoozed thread" }),
                thread({ id: "settled", title: "Settled thread" }),
              ],
              projects: [{ id: "proj_1", name: "bb", isPersonal: false, href: "", settingsHref: "" }],
            },
            settings: { inactiveThreadsEnabled: true, inactiveAfterHours: "6" },
            rpc: {
              listLifecycle: () => ({
                rows: [
                  { threadId: "parked", parkedAt: now, settledAt: null, snoozedUntil: null, snoozedAt: null },
                  { threadId: "snoozed", settledAt: null, snoozedUntil: now + 60_000, snoozedAt: now },
                  { threadId: "settled", settledAt: now, snoozedUntil: null, snoozedAt: null },
                ],
              }),
              [action]: () => ({ ok: true, reclaim: SETTLED_NOTHING }),
            },
          },
        );

        await screen.findByRole("region", { name: "Settled" });
        const current = screen.getByText("Only thread").closest("li")!;
        await parkFromCard(current, action);
        await waitFor(() =>
          expect(rendered.sidebarActionCalls).toContainEqual({
            method: "openNewThread",
            options: { projectId: "proj_1", focusPrompt: true },
          }),
        );
      },
    );

    it("uses the remaining Active threads when the first one settles elsewhere during the request", async () => {
      const pendingSettle = deferred<{ ok: true; reclaim: typeof SETTLED_NOTHING }>();
      let firstSettled = false;
      const rendered = renderSlot(
        inbox,
        { ...listProps, activeThreadId: "current" },
        {
          sidebarThreads: {
            status: "ready",
            threads: [
              thread({ id: "first", title: "First active", createdAt: 30 }),
              thread({ id: "second", title: "Second active", createdAt: 20 }),
              thread({ id: "current", title: "Current", createdAt: 10 }),
            ],
            projects: [{ id: "proj_1", name: "bb", isPersonal: false, href: "", settingsHref: "" }],
          },
          rpc: {
            listLifecycle: () => ({
              rows: firstSettled
                ? [{ threadId: "first", settledAt: Date.now(), snoozedUntil: null, snoozedAt: null }]
                : [],
            }),
            [action]: () => pendingSettle.promise,
          },
        },
      );
      const current = (await screen.findByText("Current")).closest("li")!;
      await parkFromCard(current, action);
      await waitFor(() => expect(rendered.rpcCalls.some((call) => call.method === action)).toBe(true));

      firstSettled = true;
      await rendered.emitRealtime("lifecycle", {});
      await waitFor(() =>
        expect(within(screen.getByRole("region", { name: "Active" })).queryByText("First active")).toBeNull(),
      );
      pendingSettle.resolve({ ok: true, reclaim: SETTLED_NOTHING });
      await waitFor(() =>
        expect(rendered.sidebarActionCalls).toContainEqual({
          method: "open",
          threadId: "second",
        }),
      );
    });
  });

  describe.each([
    ["Parked", "settle"],
    ["Parked", "snooze"],
    ["Snoozed", "settle"],
    ["Snoozed", "park"],
    ["Settled", "snooze"],
    ["Settled", "park"],
  ] as const)("%s compact card: %s", (shelf, action) => {
    it.each(["pinned", "active", "empty"])("follows the same navigation with %s candidates", async (destination) => {
      const now = Date.now();
      const rendered = renderSlot(
        inbox,
        { ...listProps, activeThreadId: "current" },
        {
          sidebarThreads: {
            status: "ready",
            threads: [
              thread({ id: "current", title: "Current" }),
              ...(destination === "pinned"
                ? [
                    thread({ id: "first-pin", title: "First pin", isPinned: true }),
                    thread({ id: "second-pin", title: "Second pin", isPinned: true }),
                  ]
                : []),
              ...(destination !== "empty"
                ? [
                    thread({ id: "first-active", title: "First active", updatedAt: now, createdAt: 200 }),
                    thread({ id: "last-active", title: "Last active", updatedAt: now, createdAt: 100 }),
                  ]
                : []),
              thread({ id: "inactive", title: "Inactive" }),
            ],
            projects: [{ id: "proj_1", name: "bb", isPersonal: false, href: "", settingsHref: "" }],
          },
          settings: { inactiveThreadsEnabled: true, inactiveAfterHours: "6" },
          rpc: {
            listLifecycle: () => ({
              rows: [
                {
                  threadId: "current",
                  parkedAt: shelf === "Parked" ? now : null,
                  settledAt: shelf === "Settled" ? now : null,
                  snoozedUntil: shelf === "Snoozed" ? now + 60_000 : null,
                  snoozedAt: shelf === "Snoozed" ? now : null,
                },
              ],
            }),
            [action]: () => ({ ok: true, reclaim: SETTLED_NOTHING }),
          },
        },
      );

      const region = await screen.findByRole("region", { name: shelf });
      await parkFromMenu(within(region).getByText("Current"), action);
      await waitFor(() =>
        expect(rendered.sidebarActionCalls).toEqual([
          destination === "empty"
            ? { method: "openNewThread", options: { projectId: "proj_1", focusPrompt: true } }
            : { method: "open", threadId: destination === "pinned" ? "first-pin" : "first-active" },
        ]),
      );
    });
  });

  it("reminds the user what settling released and what it left running", async () => {
    renderSlot(
      inbox,
      { ...listProps, activeThreadId: "only" },
      {
        sidebarThreads: {
          status: "ready",
          threads: [thread({ id: "only", title: "Only thread" })],
          projects: [{ id: "proj_1", name: "bb", isPersonal: false, href: "", settingsHref: "" }],
        },
        rpc: {
          listLifecycle: () => ({ rows: [] }),
          settle: () => ({
            ok: true,
            reclaim: {
              closedTerminals: 1,
              keptTerminals: 2,
              stoppedRuntime: true,
            },
          }),
        },
      },
    );

    fireEvent.click(await screen.findByLabelText("Settle thread"));
    await waitFor(() =>
      expect(toastMocks.success).toHaveBeenCalledWith(
        "Thread settled",
        expect.objectContaining({
          description: "Agent session stopped · closed 1 terminal nobody used · 2 terminals left running",
          duration: 10_000,
        }),
      ),
    );
  });

  it.each(parkingActions)("does not override navigation while %s is in flight", async (action) => {
    const pendingSettle = deferred<{ ok: true; reclaim: typeof SETTLED_NOTHING }>();
    const props = { ...listProps, activeThreadId: "slow" };
    const rendered = renderSlot(inbox, props, {
      sidebarThreads: {
        status: "ready",
        threads: [
          thread({ id: "slow", title: "Slow settle", createdAt: 20 }),
          thread({ id: "elsewhere", title: "Elsewhere", createdAt: 10 }),
        ],
        projects: [{ id: "proj_1", name: "bb", isPersonal: false, href: "", settingsHref: "" }],
      },
      rpc: {
        listLifecycle: () => ({ rows: [] }),
        [action]: () => pendingSettle.promise,
      },
    });

    await parkFromMenu(await screen.findByText("Slow settle"), action);
    await waitFor(() => expect(rendered.rpcCalls.filter((call) => call.method === action)).toHaveLength(1));
    const InboxComponent = inbox.component;
    rendered.rerender(<InboxComponent {...props} activeThreadId="elsewhere" />);
    pendingSettle.resolve({ ok: true, reclaim: SETTLED_NOTHING });
    await waitFor(() => expect(toastMocks.success).toHaveBeenCalled());
    expect(
      rendered.sidebarActionCalls.filter((call) => call.method === "open" || call.method === "openNewThread"),
    ).toEqual([]);
  });

  it("appends the reclaim reminder after the snooze wake time", async () => {
    let wakeAt = 0;
    renderSlot(inbox, listProps, {
      sidebarThreads: {
        status: "ready",
        threads: [thread({ id: "loud", title: "Loud snooze" })],
        projects: [{ id: "proj_1", name: "bb", isPersonal: false, href: "", settingsHref: "" }],
      },
      rpc: {
        listLifecycle: () => ({ rows: [] }),
        snooze: (input) => {
          wakeAt = (input as { snoozedUntil: number }).snoozedUntil;
          return {
            ok: true,
            reclaim: {
              closedTerminals: 0,
              keptTerminals: 1,
              stoppedRuntime: true,
            },
          };
        },
      },
    });

    const snooze = await screen.findByRole("combobox", {
      name: "Snooze thread",
    });
    fireEvent.keyDown(snooze, { key: "Enter" });
    fireEvent.click(await screen.findByRole("option", { name: "1 hour" }));
    await waitFor(() =>
      expect(toastMocks.success).toHaveBeenCalledWith(
        "Thread snoozed",
        expect.objectContaining({
          description: `Wakes ${formatSnoozeWakeTime(wakeAt)} · Agent session stopped · 1 terminal left running`,
          duration: 10_000,
        }),
      ),
    );
  });

  it("deduplicates snooze, confirms the wake time, and supports Undo", async () => {
    const pendingSnooze = deferred<{ ok: true; reclaim: typeof SETTLED_NOTHING }>();
    let wakeAt = 0;
    const rendered = renderSlot(inbox, listProps, {
      sidebarThreads: {
        status: "ready",
        threads: [thread({ id: "dedupe", title: "Dedupe snooze" })],
        projects: [{ id: "proj_1", name: "bb", isPersonal: false, href: "", settingsHref: "" }],
      },
      rpc: {
        listLifecycle: () => ({ rows: [] }),
        snooze: (input) => {
          wakeAt = (input as { snoozedUntil: number }).snoozedUntil;
          return pendingSnooze.promise;
        },
        unsnooze: () => ({ ok: true }),
      },
    });

    const snooze = await screen.findByRole("combobox", {
      name: "Snooze thread",
    });
    fireEvent.keyDown(snooze, { key: "Enter" });
    fireEvent.click(await screen.findByRole("option", { name: "1 hour" }));
    fireEvent.keyDown(snooze, { key: "Enter" });
    fireEvent.click(await screen.findByRole("option", { name: "Wait refresh (5 hours)" }));
    await waitFor(() => expect(rendered.rpcCalls.filter((call) => call.method === "snooze")).toHaveLength(1));

    pendingSnooze.resolve({ ok: true, reclaim: SETTLED_NOTHING });
    await waitFor(() =>
      expect(toastMocks.success).toHaveBeenCalledWith(
        "Thread snoozed",
        expect.objectContaining({
          description: `Wakes ${formatSnoozeWakeTime(wakeAt)}`,
        }),
      ),
    );
    const toastOptions = toastMocks.success.mock.calls.find(([message]) => message === "Thread snoozed")![1] as {
      action: { label: string; onClick: () => void };
    };
    expect(toastOptions.action.label).toBe("Undo");
    toastOptions.action.onClick();
    await waitFor(() =>
      expect(rendered.rpcCalls).toContainEqual({
        method: "unsnooze",
        input: { threadId: "dedupe" },
      }),
    );
  });

  it("asks to close owned ports after settling, and only closes on confirmation", async () => {
    const ports = [{ port: 3000, pid: 123 }];
    const close = vi.fn(() => ({ signalled: [3000], skipped: [], failed: [] }));
    renderSlot(inbox, listProps, {
      sidebarThreads: {
        status: "ready",
        threads: [thread({ id: "thr_ports", title: "Port owner" })],
        projects: [{ id: "proj_1", name: "bb", isPersonal: false, href: "", settingsHref: "" }],
      },
      rpc: {
        listLifecycle: () => ({ rows: [] }),
        settle: () => ({ ok: true, reclaim: SETTLED_NOTHING }),
        getThreadPorts: () => ({ ports }),
        closeThreadPorts: close,
      },
    });
    fireEvent.click(await screen.findByLabelText("Settle thread"));
    await waitFor(() =>
      expect(toastMocks.message).toHaveBeenCalledWith("Close this thread's ports?", expect.anything()),
    );
    expect(close).not.toHaveBeenCalled();
    const options = toastMocks.message.mock.calls.find(([message]) => message === "Close this thread's ports?")![1];
    await act(async () => options.action.onClick());
    expect(close).toHaveBeenCalledWith({ threadId: "thr_ports", ports });
  });

  it("ends snapshot Undo without offering an unrestricted tree redo", async () => {
    const undoToken = "cfb8bb71-7a2a-4d81-a3ab-c497bbd3a154";
    const rendered = renderSlot(inbox, listProps, {
      sidebarThreads: {
        status: "ready",
        threads: [thread({ id: "round-trip", title: "Round trip" })],
        projects: [{ id: "proj_1", name: "bb", isPersonal: false, href: "", settingsHref: "" }],
      },
      rpc: {
        listLifecycle: () => ({ rows: [] }),
        settle: () => ({ ok: true, reclaim: SETTLED_NOTHING, undoToken }),
        unsettle: () => ({ ok: true }),
      },
    });

    fireEvent.click(await screen.findByLabelText("Settle thread"));
    await waitFor(() =>
      expect(toastMocks.success).toHaveBeenCalledWith(
        "Thread settled",
        expect.objectContaining({
          action: expect.objectContaining({ label: "Undo" }),
        }),
      ),
    );
    const settleToast = toastMocks.success.mock.calls.find(([message]) => message === "Thread settled")![1] as {
      action: { onClick: () => void };
    };
    settleToast.action.onClick();

    await waitFor(() =>
      expect(rendered.rpcCalls).toContainEqual({
        method: "unsettle",
        input: { threadId: "round-trip", undoToken },
      }),
    );
    const unsettleToast = toastMocks.success.mock.calls.find(([message]) => message === "Settling undone")![1] as {
      action: { label: string; onClick: () => void };
    };
    expect(unsettleToast.action).toBeUndefined();
    expect(rendered.rpcCalls.filter((call) => call.method === "settle")).toHaveLength(1);
  });

  it("restores the original wake time when undoing an unsnooze", async () => {
    const wakeAt = Date.now() + 3_600_000;
    const rendered = renderSlot(inbox, listProps, {
      sidebarThreads: {
        status: "ready",
        threads: [thread({ id: "wake", title: "Wake round trip" })],
        projects: [{ id: "proj_1", name: "bb", isPersonal: false, href: "", settingsHref: "" }],
      },
      rpc: {
        listLifecycle: () => ({
          rows: [
            {
              threadId: "wake",
              settledAt: null,
              snoozedUntil: wakeAt,
              snoozedAt: Date.now(),
            },
          ],
        }),
        unsnooze: () => ({ ok: true }),
        snooze: () => ({ ok: true, reclaim: SETTLED_NOTHING }),
      },
    });

    const shelf = await screen.findByRole("region", { name: "Snoozed" });
    fireEvent.click(within(shelf).getByRole("button", { expanded: false }));
    fireEvent.click(within(shelf).getByLabelText("Wake thread now"));
    await waitFor(() =>
      expect(toastMocks.success).toHaveBeenCalledWith(
        "Thread woke up",
        expect.objectContaining({
          action: expect.objectContaining({ label: "Undo" }),
        }),
      ),
    );
    const wakeToast = toastMocks.success.mock.calls.find(([message]) => message === "Thread woke up")![1] as {
      action: { onClick: () => void };
    };
    wakeToast.action.onClick();

    await waitFor(() =>
      expect(rendered.rpcCalls).toContainEqual({
        method: "snooze",
        input: { threadId: "wake", snoozedUntil: wakeAt },
      }),
    );
  });

  it.each(parkingActions)("reports %s failures and leaves the active route alone", async (action) => {
    const rendered = renderSlot(
      inbox,
      { ...listProps, activeThreadId: "broken" },
      {
        sidebarThreads: {
          status: "ready",
          threads: [thread({ id: "broken", title: "Broken settle" })],
          projects: [{ id: "proj_1", name: "bb", isPersonal: false, href: "", settingsHref: "" }],
        },
        rpc: {
          listLifecycle: () => ({ rows: [] }),
          [action]: () => {
            throw new Error("database offline");
          },
        },
      },
    );

    await parkFromCard((await screen.findByText("Broken settle")).closest("li")!, action);
    await waitFor(() =>
      expect(toastMocks.error).toHaveBeenCalledWith(`Could not ${action} thread`, { description: "database offline" }),
    );
    expect(rendered.sidebarActionCalls.some((call) => call.method === "open" || call.method === "openNewThread")).toBe(
      false,
    );
  });

  it("offers Un-settle on settled rows and Wake now on snoozed rows", async () => {
    const calls: string[] = [];
    const rendered = renderSlot(inbox, listProps, {
      sidebarThreads: {
        status: "ready",
        threads: [thread({ id: "settled", title: "Settled row" }), thread({ id: "snoozed", title: "Snoozed row" })],
        projects: [{ id: "proj_1", name: "bb", isPersonal: false, href: "", settingsHref: "" }],
      },
      rpc: {
        listLifecycle: () => ({
          rows: [
            {
              threadId: "settled",
              settledAt: Date.now(),
              snoozedUntil: null,
              snoozedAt: null,
            },
            {
              threadId: "snoozed",
              settledAt: null,
              snoozedUntil: Date.now() + 3_600_000,
              snoozedAt: Date.now(),
            },
          ],
        }),
        unsettle: (input) => {
          calls.push(`unsettle:${(input as { threadId: string }).threadId}`);
          return { ok: true };
        },
        unsnooze: (input) => {
          calls.push(`unsnooze:${(input as { threadId: string }).threadId}`);
          return { ok: true };
        },
      },
    });

    await waitFor(() =>
      expect(rendered.inspection.rpcCalls.some((call) => call.method === "listLifecycle")).toBe(true),
    );
    const settledShelf = await screen.findByRole("region", { name: "Settled" });
    const snoozedShelf = await screen.findByRole("region", { name: "Snoozed" });
    fireEvent.click(within(settledShelf).getByRole("button", { expanded: false }));
    fireEvent.click(within(snoozedShelf).getByRole("button"));

    fireEvent.contextMenu(within(settledShelf).getByText("Settled row"));
    let menu = await screen.findByRole("menu", { name: "Thread actions" });
    expect(within(menu).getByText("Un-settle")).toBeDefined();
    expect(within(menu).getByText("Rename")).toBeDefined();
    expect(within(menu).queryByText("Wake now")).toBeNull();
    fireEvent.click(within(menu).getByText("Un-settle"));
    await waitFor(() => expect(calls).toContain("unsettle:settled"));

    fireEvent.contextMenu(within(snoozedShelf).getByText("Snoozed row"));
    menu = await screen.findByRole("menu", { name: "Thread actions" });
    expect(within(menu).getByText("Wake now")).toBeDefined();
    expect(within(menu).getByText("Rename")).toBeDefined();
    expect(within(menu).queryByText("Un-settle")).toBeNull();
    fireEvent.click(within(menu).getByText("Wake now"));
    await waitFor(() => expect(calls).toContain("unsnooze:snoozed"));
  });

  for (const busyThread of [
    thread({ id: "running", title: "Running row", indicator: "runtime" }),
    thread({
      id: "pending",
      title: "Pending row",
      hasPendingInteraction: true,
    }),
  ]) {
    it(`disables Archive while ${busyThread.id}`, async () => {
      const rendered = render([busyThread]);
      fireEvent.contextMenu(await screen.findByText(busyThread.title!));
      const archive = within(await screen.findByRole("menu", { name: "Thread actions" })).getByText("Archive");
      expect(archive.getAttribute("data-disabled")).not.toBeNull();
      fireEvent.click(archive);
      expect(rendered.sidebarActionCalls).not.toContainEqual({
        method: "archive",
        threadId: busyThread.id,
      });
    });
  }

  it("regenerates from the menu and disables repeated clicks while waiting", async () => {
    const result = deferred<{ title: string }>();
    const regenerateTitle = vi.fn((_input: unknown) => result.promise);
    renderSlot(inbox, listProps, {
      sidebarThreads: { status: "ready", threads: [thread({ title: "Original title" })], projects: [] },
      rpc: { listLifecycle: () => ({ rows: [] }), regenerateTitle },
    });
    fireEvent.contextMenu(await screen.findByText("Original title"));
    fireEvent.click(screen.getByRole("menuitem", { name: "Regenerate title" }));
    await waitFor(() => expect(regenerateTitle).toHaveBeenCalledTimes(1));
    expect(regenerateTitle.mock.calls[0]?.[0]).toEqual({ threadId: "thr_1" });
    expect(screen.queryByRole("menu")).toBeNull();
    expect(screen.getByRole("status", { name: "Generating title" })).toBeTruthy();
    fireEvent.contextMenu(screen.getByText("Original title"));
    expect(screen.getByRole("menuitem", { name: "Regenerating title…" }).getAttribute("aria-disabled")).toBe("true");
    result.resolve({ title: "New title" });
    await waitFor(() => expect(toastMocks.success).toHaveBeenCalledWith("Thread title regenerated"));
    expect(screen.queryByRole("status", { name: "Generating title" })).toBeNull();
    expect(regenerateTitle).toHaveBeenCalledTimes(1);
  });

  it("shows regeneration errors and keeps the existing title", async () => {
    renderSlot(inbox, listProps, {
      sidebarThreads: { status: "ready", threads: [thread({ title: "Original title" })], projects: [] },
      rpc: {
        listLifecycle: () => ({ rows: [] }),
        regenerateTitle: () => {
          throw new Error("Title service unavailable");
        },
      },
    });
    fireEvent.contextMenu(await screen.findByText("Original title"));
    fireEvent.click(screen.getByRole("menuitem", { name: "Regenerate title" }));
    await waitFor(() =>
      expect(toastMocks.error).toHaveBeenCalledWith("Could not regenerate title", {
        description: "Title service unavailable",
      }),
    );
    expect(screen.getByText("Original title")).toBeTruthy();
    expect(screen.queryByRole("status", { name: "Generating title" })).toBeNull();
  });

  it("renames from the menu and saves with Enter", async () => {
    const rendered = render([thread({ id: "thr_rename", title: "Original title" })]);
    const row = await screen.findByRole("link", { name: "Original title" });
    act(() => row.focus());
    fireEvent.contextMenu(row);
    fireEvent.click(within(await screen.findByRole("menu")).getByText("Rename"));

    const input = await screen.findByRole("textbox", {
      name: "Rename Original title",
    });
    // Let the menu's deferred focus restoration finish before typing.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(document.activeElement).toBe(input);
    expect(input.isConnected).toBe(true);
    fireEvent.change(input, { target: { value: "Updated title" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() =>
      expect(rendered.sidebarActionCalls).toContainEqual({
        method: "rename",
        threadId: "thr_rename",
        title: "Updated title",
      }),
    );
  });

  it("supports double-click rename, Escape cancel, and blur save", async () => {
    const rendered = render([thread({ id: "thr_inline", title: "Inline title" })]);
    const row = await screen.findByRole("link", { name: "Inline title" });

    fireEvent.doubleClick(row);
    let input = await screen.findByRole("textbox", {
      name: "Rename Inline title",
    });
    fireEvent.change(input, { target: { value: "Canceled title" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(rendered.sidebarActionCalls.some((call) => call.method === "rename")).toBe(false);

    fireEvent.doubleClick(row);
    input = await screen.findByRole("textbox", { name: "Rename Inline title" });
    fireEvent.change(input, { target: { value: "Blurred title" } });
    fireEvent.blur(input);
    await waitFor(() =>
      expect(rendered.sidebarActionCalls).toContainEqual({
        method: "rename",
        threadId: "thr_inline",
        title: "Blurred title",
      }),
    );
  });

  it("copies the branch, thread ID, and thread link", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    render([
      thread({
        id: "thr_copy",
        title: "Copy data",
        environment: {
          id: "env_1",
          name: "Worktree",
          branchName: "feature/context-menu",
          workspaceDisplayKind: "managed-worktree",
          path: null,
          isWorktree: null,
          providerId: null,
        },
      }),
    ]);

    const openCopyMenu = async () => {
      fireEvent.contextMenu(await screen.findByText("Copy data"));
      const menu = await screen.findByRole("menu", { name: "Thread actions" });
      const copy = within(menu).getByRole("menuitem", { name: "Copy" });
      fireEvent.click(copy);
      const firstCopyAction = await screen.findByText("Copy branch");
      return firstCopyAction.closest<HTMLElement>('[role="menu"]')!;
    };

    let copyMenu = await openCopyMenu();
    fireEvent.click(within(copyMenu).getByText("Copy branch"));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("feature/context-menu"));

    copyMenu = await openCopyMenu();
    fireEvent.click(within(copyMenu).getByText("Copy thread ID"));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("thr_copy"));

    copyMenu = await openCopyMenu();
    fireEvent.click(within(copyMenu).getByText("Copy thread link"));
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/projects/proj_1/threads/thr_copy`),
    );
  });

  it("copies personal thread links and reports clipboard failures", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    render(
      [thread({ id: "thr_personal", title: "Personal thread" })],
      [{ id: "proj_1", name: "Personal", isPersonal: true, href: "", settingsHref: "" }],
    );
    const copyLink = async () => {
      fireEvent.contextMenu(await screen.findByText("Personal thread"));
      fireEvent.click(screen.getByRole("menuitem", { name: "Copy" }));
      fireEvent.click(await screen.findByText("Copy thread link"));
    };
    await copyLink();
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/threads/thr_personal`));
    writeText.mockRejectedValueOnce(new Error("Clipboard denied"));
    await copyLink();
    await waitFor(() => expect(toastMocks.error).toHaveBeenCalledWith("Failed to copy thread link"));
  });

  it("confirms deletion with the thread title and project before deleting", async () => {
    const rendered = renderSlot(inbox, listProps, {
      sidebarThreads: {
        status: "ready",
        threads: [
          thread({ id: "thr_del", title: "Delete me" }),
          thread({ id: "thr_child", title: "Child", parentThreadId: "thr_del" }),
          thread({ id: "thr_grandchild", title: "Grandchild", parentThreadId: "thr_child" }),
        ],
        projects: [{ id: "proj_1", name: "bb", isPersonal: false, href: "", settingsHref: "" }],
      },
      providers: { status: "ready", providers: defaultProviders },
      rpc: { listLifecycle: () => ({ rows: [] }), deleteThread: () => ({ ok: true }) },
    });
    fireEvent.contextMenu(await screen.findByText("Delete me"));
    const menu = await screen.findByRole("menu", { name: "Thread actions" });
    fireEvent.click(within(menu).getByText("Delete"));

    const dialog = await screen.findByRole("dialog", { name: "Delete thread?" });
    expect(within(dialog).getByText("Delete me")).toBeTruthy();
    expect(within(dialog).getByText("bb")).toBeTruthy();
    expect(within(dialog).getByText(/its 2 child threads/)).toBeTruthy();
    expect(rendered.rpcCalls.filter((call) => call.method === "deleteThread")).toEqual([]);
    expect(rendered.sidebarActionCalls).not.toContainEqual(expect.objectContaining({ method: "requestDelete" }));

    fireEvent.click(within(dialog).getByRole("button", { name: "Delete thread" }));
    await waitFor(() =>
      expect(rendered.rpcCalls).toContainEqual({
        method: "deleteThread",
        input: { threadId: "thr_del", childThreadsConfirmed: true },
      }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Delete thread?" })).toBeNull());
  });

  it("cancelling the delete confirmation deletes nothing", async () => {
    const rendered = render([thread({ id: "thr_keep", title: "Keep me" })]);
    fireEvent.contextMenu(await screen.findByText("Keep me"));
    const menu = await screen.findByRole("menu", { name: "Thread actions" });
    fireEvent.click(within(menu).getByText("Delete"));
    const dialog = await screen.findByRole("dialog", { name: "Delete thread?" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Delete thread?" })).toBeNull());
    expect(rendered.rpcCalls.filter((call) => call.method === "deleteThread")).toEqual([]);
  });

  it("uses custom snooze times from plugin settings", async () => {
    let snoozed: { threadId: string; snoozedUntil: number } | null = null;
    renderSlot(inbox, listProps, {
      sidebarThreads: {
        status: "ready",
        threads: [thread({ id: "thr_snooze", title: "Snooze me" })],
        projects: [{ id: "proj_1", name: "bb", isPersonal: false, href: "", settingsHref: "" }],
      },
      settings: { snoozePresets: "15m, Lunch break=3h" },
      rpc: {
        listLifecycle: () => ({ rows: [] }),
        snooze: (input) => {
          snoozed = input as { threadId: string; snoozedUntil: number };
          return { ok: true };
        },
      },
    });

    const before = Date.now();
    const snooze = await screen.findByRole("combobox", {
      name: "Snooze thread",
    });
    fireEvent.keyDown(snooze, { key: "Enter" });
    fireEvent.click(await screen.findByRole("option", { name: "15 minutes" }));
    await waitFor(() => expect(snoozed).not.toBeNull());
    expect(snoozed!.threadId).toBe("thr_snooze");
    expect(snoozed!.snoozedUntil).toBeGreaterThanOrEqual(before + 15 * 60_000);

    fireEvent.contextMenu(await screen.findByText("Snooze me"));
    const menu = await screen.findByRole("menu", { name: "Thread actions" });
    expect(within(menu).getByText("Snooze").getAttribute("aria-haspopup")).toBe("menu");
  });

  it.each(["clock", "context"])("uses the five calendar presets from the %s menu", async (menuType) => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 0, 5, 22));
    try {
      const snooze = vi.fn(() => ({ ok: true }));
      renderSlot(inbox, listProps, {
        sidebarThreads: {
          status: "ready",
          threads: [thread({ id: "thr_calendar", title: "Calendar snooze", updatedAt: Date.now() })],
          projects: [],
        },
        rpc: {
          getSidebarSettings: () => ({ ...defaultSidebarSettings, snoozePresets: DEFAULT_SNOOZE_PRESET_CONFIG }),
          listLifecycle: () => ({ rows: [] }),
          snooze,
        },
      });
      let menu: HTMLElement;
      if (menuType === "clock") {
        fireEvent.keyDown(await screen.findByRole("combobox", { name: "Snooze thread" }), { key: "Enter" });
        menu = await screen.findByRole("listbox");
      } else {
        fireEvent.contextMenu(await screen.findByText("Calendar snooze"));
        fireEvent.click(await screen.findByRole("menuitem", { name: "Snooze" }));
        menu = (await screen.findByRole("menuitem", { name: "1 hour" })).closest<HTMLElement>('[role="menu"]')!;
      }
      const role = menuType === "clock" ? "option" : "menuitem";
      expect(
        within(menu)
          .getAllByRole(role)
          .slice(0, 5)
          .map((item) => item.textContent),
      ).toEqual(["1 hour", "Wait refresh (5 hours)", "This evening", "Tomorrow morning", "Next week"]);
      const evening = within(menu).getByRole(role, { name: "This evening" });
      expect(evening.getAttribute("aria-disabled")).toBe("true");
      fireEvent.click(evening);
      expect(snooze).not.toHaveBeenCalled();
      // An open menu must resolve against the date when the user selects it.
      vi.setSystemTime(new Date(2026, 0, 6, 0, 1));
      fireEvent.click(within(menu).getByRole(role, { name: "Tomorrow morning" }));
      await waitFor(() =>
        expect(snooze).toHaveBeenCalledWith({
          threadId: "thr_calendar",
          snoozedUntil: new Date(2026, 0, 7, 9).getTime(),
        }),
      );
    } finally {
      cleanup();
      vi.useRealTimers();
    }
  });
});

it("keeps parked threads parked when opened and offers Resume with Undo", async () => {
  const resume = vi.fn(() => ({ ok: true }));
  const park = vi.fn(() => ({ ok: true, reclaim: SETTLED_NOTHING }));
  const rendered = renderSlot(inbox, listProps, {
    sidebarThreads: {
      status: "ready",
      threads: [thread({ id: "waiting", title: "Awaiting review", isPinned: true })],
      projects: [{ id: "proj_1", name: "bb", isPersonal: false, href: "", settingsHref: "" }],
    },
    rpc: {
      listLifecycle: () => ({
        rows: [
          {
            threadId: "waiting",
            parkedAt: Date.now() - 5 * 86400000,
            settledAt: null,
            snoozedUntil: null,
            snoozedAt: null,
          },
        ],
      }),
      resume,
      park,
    },
  });
  const shelf = await screen.findByRole("region", { name: "Parked" });
  fireEvent.click(within(shelf).getByRole("button"));
  expect(within(shelf).getByText("Waiting 5d")).toBeDefined();
  fireEvent.click(within(shelf).getByRole("link", { name: "bb · Awaiting review" }));
  expect(resume).not.toHaveBeenCalled();
  expect(rendered.sidebarActionCalls).toContainEqual({
    method: "open",
    threadId: "waiting",
    options: { split: false },
  });
  fireEvent.click(within(shelf).getByRole("button", { name: "Resume thread" }));
  await waitFor(() => expect(resume).toHaveBeenCalled());
  const toast = toastMocks.success.mock.calls.find(([message]) => message === "Thread returned to the inbox");
  expect(toast).toBeDefined();
  act(() => toast![1].action.onClick());
  await waitFor(() => expect(park).toHaveBeenCalled());
});
