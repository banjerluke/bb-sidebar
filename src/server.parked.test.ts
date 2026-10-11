import { describe, expect, it, vi } from "vitest";
import { makeThreadResponse } from "@get-bb/plugin-sdk/testing";
import type { BbPluginApi } from "@get-bb/plugin-sdk";
import plugin, { type StoredLifecycleRow } from "./server";
import {
  createFakePluginHost,
  disposers,
  standardProject,
  projectThread,
  projectsWith,
  terminalSession,
  availablePullRequest,
  loadPlugin,
  deferred,
  type LifecycleListResult,
  type Environment,
  type ProjectThread,
} from "./test-server";

describe("parked lifecycle", () => {
  it("stores parking, replaces snooze, and resumes with cleanup protection", async () => {
    const harness = await loadPlugin();
    await harness.behavior.callRpc("snooze", { threadId: "thr_1", snoozedUntil: Date.now() + 60000 });
    await harness.behavior.callRpc("park", { threadId: "thr_1" });
    expect(await harness.behavior.callRpc("listLifecycle", {})).toMatchObject({
      rows: [{ parkedAt: expect.any(Number), snoozedUntil: null, settledAt: null }],
    });
    await harness.behavior.callRpc("resume", { threadId: "thr_1" });
    expect(await harness.behavior.callRpc("listLifecycle", {})).toMatchObject({
      rows: [{ parkedAt: null, settledOverride: "active" }],
    });
  });
  it.each(["snooze", "settle"])("clears parking when moved to %s", async (method) => {
    const harness = await loadPlugin();
    await harness.behavior.callRpc("park", { threadId: "thr_1" });
    await harness.behavior.callRpc(method, {
      threadId: "thr_1",
      ...(method === "snooze" ? { snoozedUntil: Date.now() + 60000 } : {}),
    });
    expect(await harness.behavior.callRpc("listLifecycle", {})).toMatchObject({ rows: [{ parkedAt: null }] });
  });
  it("clears parking permanently when work starts", async () => {
    const harness = await loadPlugin();
    await harness.behavior.callRpc("park", { threadId: "thr_1" });
    await harness.behavior.emitThreadEvent("thread.active", { thread: makeThreadResponse({ id: "thr_1" }) });
    expect(await harness.behavior.callRpc("listLifecycle", {})).toEqual({ rows: [] });
  });
});
