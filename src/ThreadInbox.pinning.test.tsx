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
  it("unpins a pinned row from its hover action", async () => {
    const rendered = render([thread({ id: "pin", title: "Pinned work", isPinned: true })]);

    fireEvent.click(await screen.findByRole("button", { name: "Unpin Pinned work" }));
    await waitFor(() =>
      expect(rendered.sidebarActionCalls).toContainEqual({
        method: "setPinned",
        threadId: "pin",
        pinned: false,
      }),
    );
  });

  it.each(["Active", "Settled", "Snoozed", "Parked"])(
    "pins a thread from %s through the lifecycle RPC",
    async (shelf) => {
      const now = Date.now();
      const rendered = renderSlot(inbox, listProps, {
        sidebarThreads: {
          status: "ready",
          threads: [thread({ id: "to-pin", title: "Pin this thread" })],
          projects: [{ id: "proj_1", name: "bb", isPersonal: false, href: "", settingsHref: "" }],
        },
        rpc: {
          listLifecycle: () => ({
            rows:
              shelf === "Active"
                ? []
                : [
                    {
                      threadId: "to-pin",
                      parkedAt: shelf === "Parked" ? now : null,
                      settledAt: shelf === "Settled" ? now : null,
                      settledOverride: shelf === "Settled" ? "settled" : null,
                      snoozedUntil: shelf === "Snoozed" ? now + 60_000 : null,
                      snoozedAt: shelf === "Snoozed" ? now : null,
                    },
                  ],
          }),
          pin: () => ({ ok: true }),
        },
      });
      const section = await screen.findByRole("region", { name: shelf });
      if (shelf !== "Active") {
        fireEvent.click(within(section).getByRole("button", { expanded: false }));
      }
      fireEvent.contextMenu(within(section).getByText("Pin this thread"));
      fireEvent.click(
        within(await screen.findByRole("menu", { name: "Thread actions" })).getByRole("menuitem", { name: "Pin" }),
      );

      await waitFor(() =>
        expect(rendered.rpcCalls).toContainEqual({
          method: "pin",
          input: { threadId: "to-pin" },
        }),
      );
      expect(rendered.sidebarActionCalls.filter((call) => call.method === "setPinned")).toEqual([]);
    },
  );

  it("reports a failed pin and keeps the thread on its shelf", async () => {
    renderSlot(inbox, listProps, {
      sidebarThreads: {
        status: "ready",
        threads: [thread({ id: "to-pin", title: "Still settled" })],
        projects: [{ id: "proj_1", name: "bb", isPersonal: false, href: "", settingsHref: "" }],
      },
      rpc: {
        listLifecycle: () => ({
          rows: [
            {
              threadId: "to-pin",
              settledAt: Date.now(),
              settledOverride: "settled",
              snoozedUntil: null,
              snoozedAt: null,
            },
          ],
        }),
        pin: () => {
          throw new Error("pin update failed");
        },
      },
    });
    const section = await screen.findByRole("region", { name: "Settled" });
    fireEvent.click(within(section).getByRole("button", { expanded: false }));
    fireEvent.contextMenu(within(section).getByText("Still settled"));
    fireEvent.click(
      within(await screen.findByRole("menu", { name: "Thread actions" })).getByRole("menuitem", { name: "Pin" }),
    );

    await waitFor(() =>
      expect(toastMocks.error).toHaveBeenCalledWith("Could not pin thread", {
        description: "pin update failed",
      }),
    );
    expect(within(section).getByText("Still settled")).toBeDefined();
    expect(screen.queryByRole("region", { name: "Pinned" })).toBeNull();
  });

  it("keeps explicit shelf changes visible while the host's pin flag is stale", async () => {
    const now = Date.now();
    renderSlot(inbox, listProps, {
      sidebarThreads: {
        status: "ready",
        threads: [
          thread({ id: "auto", title: "Pinned auto", isPinned: true }),
          thread({ id: "manual", title: "Pinned manual", isPinned: true }),
          thread({ id: "snoozed", title: "Pinned snooze", isPinned: true }),
        ],
        projects: [{ id: "proj_1", name: "bb", isPersonal: false, href: "", settingsHref: "" }],
      },
      rpc: {
        evaluateAutoSettle: () => ({ changedThreadIds: [] }),
        listLifecycle: () => ({
          rows: [
            {
              threadId: "auto",
              settledAt: now,
              settledOverride: null,
              snoozedUntil: null,
              snoozedAt: null,
            },
            {
              threadId: "manual",
              settledAt: now,
              settledOverride: "settled" as const,
              snoozedUntil: null,
              snoozedAt: null,
            },
            {
              threadId: "snoozed",
              settledAt: null,
              settledOverride: null,
              snoozedUntil: now + 60_000,
              snoozedAt: now,
            },
          ],
        }),
      },
    });

    const pinned = await screen.findByRole("region", { name: "Pinned" });
    expect(within(pinned).getByText("Pinned auto")).toBeDefined();
    expect(within(pinned).queryByText("Pinned manual")).toBeNull();
    expect(within(pinned).queryByText("Pinned snooze")).toBeNull();
    expect(await screen.findByRole("region", { name: "Settled" })).toBeDefined();
    expect(await screen.findByRole("region", { name: "Snoozed" })).toBeDefined();
  });
});
