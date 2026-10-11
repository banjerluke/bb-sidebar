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
});
