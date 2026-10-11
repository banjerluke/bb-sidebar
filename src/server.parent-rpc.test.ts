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

describe("parent thread RPC", () => {
  it("uses BB's thread update for assigning and removing a parent", async () => {
    const harness = await loadPlugin();
    let state = makeThreadResponse({ id: "thr_1" });
    harness.inspection.sdk.stub("threads.get", async () => state);
    harness.inspection.sdk.stub("threads.update", async ({ parentThreadId }) => {
      state = { ...state, parentThreadId: parentThreadId ?? null };
      return state;
    });
    for (const parentThreadId of ["thr_parent", null]) {
      await expect(harness.behavior.callRpc("setThreadParent", { threadId: "thr_1", parentThreadId })).resolves.toEqual(
        { ok: true },
      );
    }
    expect(harness.inspection.sdk.callsTo("threads.update")).toEqual([
      [{ threadId: "thr_1", parentThreadId: "thr_parent" }],
      [{ threadId: "thr_1", parentThreadId: null }],
    ]);
  });
  it("propagates BB's validation failures", async () => {
    const harness = await loadPlugin();
    harness.inspection.sdk.stub("threads.update", async () => {
      throw new Error("Invalid parent relationship");
    });
    await expect(
      harness.behavior.callRpc("setThreadParent", { threadId: "thr_1", parentThreadId: "thr_parent" }),
    ).rejects.toThrow("Invalid parent relationship");
  });
});
