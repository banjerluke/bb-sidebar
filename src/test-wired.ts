import { copyFileSync } from "node:fs";
import { act } from "@testing-library/react";
import { renderSlot } from "./test-slot";
import { makeThreadResponse } from "@get-bb/plugin-sdk/testing";
import type { PluginSidebarThread } from "@get-bb/plugin-sdk";
import { afterEach, vi } from "vitest";
import plugin from "./server";
import { bbSidebarRpcContract } from "./contract";
import { createFakePluginHost, projectThread, projectsWith, standardProject } from "./test-server";
import { inbox, sidebarSettings, listProps, defaultProviders } from "./test-inbox";

const disposers: Array<() => Promise<void>> = [];
afterEach(async () => {
  await Promise.all(disposers.splice(0).map((dispose) => dispose()));
  vi.useRealTimers();
});

/** Keep the SDK's validation and JSON wire drivers across the explicit host/app bridge. */
export async function createWired(
  initial: PluginSidebarThread[],
  options: { fixture?: string; rpcGate?: Promise<void>; terminals?: boolean } = {},
) {
  let threads = [...initial];
  let terminalOpen = options.terminals ?? false;
  const response = (threadId: string) => {
    const item = threads.find((item) => item.id === threadId);
    if (!item) throw new Error(`Unknown thread ${threadId}`);
    return makeThreadResponse({
      id: item.id,
      title: item.title,
      projectId: item.projectId,
      parentThreadId: item.parentThreadId,
      pinnedAt: item.pinnedAt,
    });
  };
  const { bb, harness } = createFakePluginHost({
    pluginId: "bb-sidebar",
    sdk: {
      plugins: { getSettings: async () => ({ values: {}, pluginId: "bb-sidebar" }) },
      projects: {
        get: async () => standardProject(),
        list: async () =>
          projectsWith(
            threads.map((item) =>
              projectThread({
                id: item.id,
                title: item.title,
                parentThreadId: item.parentThreadId,
                pinnedAt: item.pinnedAt,
                pinSortKey: item.pinSortKey,
                updatedAt: item.updatedAt,
              }),
            ),
          ),
      },
      threads: {
        get: async ({ threadId }) => response(threadId),
        pin: async ({ threadId }) => {
          threads = threads.map((item) =>
            item.id === threadId ? { ...item, isPinned: true, pinnedAt: Date.now(), pinSortKey: "UU" } : item,
          );
          return response(threadId);
        },
        unpin: async ({ threadId }) => {
          threads = threads.map((item) =>
            item.id === threadId ? { ...item, isPinned: false, pinnedAt: null, pinSortKey: null } : item,
          );
          return response(threadId);
        },
        defaultExecutionOptions: async () => null,
      },
      terminals: {
        list: async () => ({
          sessions: terminalOpen
            ? [
                {
                  id: "terminal_1",
                  threadId: initial[0]!.id,
                  environmentId: null,
                  hostId: "host_1",
                  status: "running",
                  lastUserInputAt: Date.now(),
                  closeReason: null,
                  cols: 80,
                  rows: 24,
                  createdAt: 1,
                  updatedAt: 1,
                  exitCode: null,
                  initialCwd: "/workspace/sidebar",
                  title: "zsh",
                },
              ]
            : [],
        }),
        close: async () => {
          terminalOpen = false;
        },
      },
    },
  });
  const db = bb.storage.database();
  if (options.fixture) {
    const filename = db.name;
    db.close();
    copyFileSync(options.fixture, filename);
  }
  const slots = new Set<ReturnType<typeof renderSlot>>();
  let delivered = 0;
  // Publications stay in the fake host's normalized ledger. Explicit flush is
  // the transport pump, so events can also be driven without an app RPC call.
  async function flush() {
    while (delivered < harness.inspection.realtimeSignals.length) {
      const signal = harness.inspection.realtimeSignals[delivered++]!;
      for (const slot of slots) await slot.behavior.emitRealtime(signal.channel, signal.payload);
    }
  }
  function rpcHandlers(replies: Array<{ method: string; result: unknown }>) {
    return Object.fromEntries(
      Object.keys(bbSidebarRpcContract).map((method) => [
        method,
        async (input: unknown) => {
          await options.rpcGate;
          const result = await harness.behavior.callRpc(method, input);
          replies.push({ method, result });
          return result;
        },
      ]),
    );
  }
  const sidebarState = () => ({
    status: "ready" as const,
    threads,
    projects: [{ id: "proj_1", name: "Sidebar", isPersonal: false, href: "", settingsHref: "" }],
  });
  await plugin(bb);
  disposers.push(async () => {
    for (const slot of slots) slot.lifecycle.unmount();
    slots.clear();
    await harness.lifecycle.dispose();
  });
  function mount(kind: "inbox" | "settings" = "inbox") {
    const rpcReplies: Array<{ method: string; result: unknown }> = [];
    const rpc = rpcHandlers(rpcReplies);
    const slot =
      kind === "inbox"
        ? renderSlot(inbox, listProps, {
            rpc,
            sidebarThreads: sidebarState(),
            providers: { status: "ready", providers: defaultProviders },
          })
        : renderSlot(sidebarSettings, {}, { rpc });
    slots.add(slot);
    return Object.assign(slot, { rpcReplies });
  }
  return {
    bb,
    harness,
    mount,
    flush,
    db: bb.storage.database(),
    async call(method: string, input: unknown = {}) {
      let result: unknown;
      await act(async () => {
        result = await harness.behavior.callRpc(method, input);
      });
      await flush();
      return result;
    },
    async event(name: "thread.active" | "thread.deleted", threadId: string) {
      await act(async () => {
        await harness.behavior.emitThreadEvent(name, { thread: response(threadId) });
        if (name === "thread.deleted") {
          threads = threads.filter((item) => item.id !== threadId);
        }
      });
      await flush();
    },
    unmount(slot: ReturnType<typeof renderSlot>) {
      slots.delete(slot);
      slot.lifecycle.unmount();
    },
    async advance(ms: number) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(ms);
      });
      await flush();
    },
  };
}
