import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakePluginHost, makeThreadResponse } from "@get-bb/plugin-sdk/testing";
import { AUTO_TITLE_RECOVERY_MIGRATION, createAutoTitleRecovery } from "./auto-title";
import { createTitleRegenerator } from "./regenerate-title";

const disposers: Array<() => Promise<void>> = [];
beforeEach(() => vi.useFakeTimers());
afterEach(async () => {
  await Promise.all(disposers.splice(0).map((dispose) => dispose()));
  vi.useRealTimers();
});

function setup(useRealGenerator = false) {
  const { bb, harness } = createFakePluginHost({ pluginId: "bb-sidebar" });
  const db = bb.storage.database();
  bb.storage.migrate(db, [AUTO_TITLE_RECOVERY_MIGRATION]);
  let thread = makeThreadResponse({
    id: "target",
    title: null,
    visibility: "visible",
    environmentId: "workspace",
  });
  let off = false;
  const sdk = harness.inspection.sdk;
  sdk.stub("threads.get", async ({ threadId }: { threadId: string }) => ({ ...thread, id: threadId }));
  sdk.stub("system.aiServices", async () => ({
    selections: {
      "thread-title": off
        ? { mode: "off" }
        : {
            mode: "service",
            pluginId: "provider-codex",
            serviceId: "codex",
          },
    },
    services: [
      {
        id: "codex",
        pluginId: "provider-codex",
        displayName: "Codex",
        tasks: ["thread-title"],
        status: { ready: true },
      },
    ],
  }));
  const regenerate = vi.fn(async () => ({ title: "Review sidebar pull request" }));
  createAutoTitleRecovery(bb, useRealGenerator ? createTitleRegenerator(bb) : regenerate);
  disposers.push(() => harness.lifecycle.dispose());
  return {
    bb,
    harness,
    sdk,
    db,
    regenerate,
    setThread: (changes: Partial<typeof thread>) => {
      thread = { ...thread, ...changes };
    },
    setOff: () => {
      off = true;
    },
    active: () => harness.behavior.emitThreadEvent("thread.active", { thread }),
    idle: () => harness.behavior.emitThreadEvent("thread.idle", { thread, lastAssistantText: null }),
  };
}

describe("automatic title recovery", () => {
  it("waits for BB, recovers once, and remembers the attempt after reload", async () => {
    const state = setup();
    await state.active();
    await state.idle();
    await vi.advanceTimersByTimeAsync(9_999);
    expect(state.regenerate).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(state.regenerate).toHaveBeenCalledExactlyOnceWith("target");
    await state.active();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(state.regenerate).toHaveBeenCalledTimes(1);
    const replacement = await state.harness.lifecycle.reload((bb) => createAutoTitleRecovery(bb, state.regenerate));
    disposers.push(() => replacement.harness.lifecycle.dispose());
    await replacement.harness.behavior.emitThreadEvent("thread.active", {
      thread: makeThreadResponse({ id: "target", title: null, visibility: "visible" }),
    });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(state.regenerate).toHaveBeenCalledTimes(1);
  });

  it("lets BB's successful title win before recovery starts", async () => {
    const state = setup();
    await state.active();
    state.setThread({ title: "BB generated title" });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(state.regenerate).not.toHaveBeenCalled();
    expect(state.sdk.callsTo("system.aiServices")).toHaveLength(0);
  });

  it("does no generation when thread titles are off", async () => {
    const state = setup();
    await state.active();
    state.setOff();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(state.regenerate).not.toHaveBeenCalled();
    expect(state.db.prepare("SELECT * FROM title_recovery_attempts").all()).toEqual([]);
  });

  it.each([{ title: "Manual title" }, { visibility: "hidden" as const }, { archivedAt: 1 }, { deletedAt: 1 }])(
    "skips threads that already have a title or are unavailable: %j",
    async (changes) => {
      const state = setup();
      state.setThread(changes);
      await state.active();
      await vi.advanceTimersByTimeAsync(10_000);
      expect(state.regenerate).not.toHaveBeenCalled();
      expect(state.sdk.callsTo("threads.get")).toHaveLength(0);
    },
  );

  it("does not keep retrying after a failed generation", async () => {
    const state = setup();
    state.regenerate.mockRejectedValue(new Error("Timed out"));
    await state.active();
    await vi.advanceTimersByTimeAsync(10_000);
    await state.idle();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(state.regenerate).toHaveBeenCalledTimes(1);
  });

  it("cancels pending work and removes the attempt when a thread is deleted", async () => {
    const state = setup();
    await state.active();
    await state.harness.behavior.emitThreadEvent("thread.deleted", { thread: makeThreadResponse({ id: "target" }) });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(state.regenerate).not.toHaveBeenCalled();
    await state.active();
    await vi.advanceTimersByTimeAsync(10_000);
    await state.harness.behavior.emitThreadEvent("thread.deleted", { thread: makeThreadResponse({ id: "target" }) });
    expect(state.db.prepare("SELECT * FROM title_recovery_attempts").all()).toEqual([]);
  });

  it("cancels timers when the plugin is disposed", async () => {
    const state = setup();
    await state.active();
    await state.harness.lifecycle.dispose();
    disposers.pop();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(state.regenerate).not.toHaveBeenCalled();
  });

  it("does not start recovery or leave an attempt for a thread deleted during the service check", async () => {
    const state = setup();
    let finish!: () => void;
    const serviceCheck = new Promise<void>((resolve) => {
      finish = resolve;
    });
    state.sdk.stub("system.aiServices", async () => {
      await serviceCheck;
      return { selections: { "thread-title": { mode: "automatic" } }, services: [] };
    });
    await state.active();
    await vi.advanceTimersByTimeAsync(10_000);
    await state.harness.behavior.emitThreadEvent("thread.deleted", {
      thread: makeThreadResponse({ id: "target" }),
    });
    finish();
    await vi.advanceTimersByTimeAsync(0);
    expect(state.regenerate).not.toHaveBeenCalled();
    expect(state.db.prepare("SELECT * FROM title_recovery_attempts").all()).toEqual([]);
  });

  it("limits simultaneous recoveries and drains queued threads", async () => {
    const state = setup();
    let finish!: () => void;
    const pending = new Promise<void>((resolve) => {
      finish = resolve;
    });
    state.regenerate.mockImplementation(async () => {
      await pending;
      return { title: "Recovered title" };
    });
    for (const id of ["one", "two", "three"]) {
      state.setThread({ id });
      await state.active();
    }
    await vi.advanceTimersByTimeAsync(10_000);
    expect(state.regenerate).toHaveBeenCalledTimes(2);
    finish();
    await vi.advanceTimersByTimeAsync(0);
    expect(state.regenerate).toHaveBeenCalledTimes(3);
  });

  it("names an untitled thread through bb's own title service", async () => {
    const state = setup(true);
    state.sdk.stub("threads.experimental_regenerateTitle", async ({ threadId }: { threadId: string }) =>
      makeThreadResponse({ id: threadId, title: "Review sidebar pull request" }),
    );
    await state.active();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(state.sdk.callsTo("threads.experimental_regenerateTitle")).toEqual([[{ threadId: "target" }]]);
    expect(state.harness.logEntries).toEqual([]);
  });
});
