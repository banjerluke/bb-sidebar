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

describe("lifecycle RPC", () => {
  it("returns no ports when no threads have environments", async () => {
    const harness = await loadPlugin();
    await expect(harness.behavior.callRpc("getOpenPorts", {})).resolves.toEqual({
      groups: [],
    });
  });

  it("returns only model and reasoning details, including unset options", async () => {
    const harness = await loadPlugin();
    harness.inspection.sdk.stub("threads.defaultExecutionOptions", async () => ({
      model: "gpt-6",
      reasoningLevel: "high",
      permissionMode: "auto",
      serviceTier: "default",
      source: "client/turn/start",
    }));
    await expect(
      harness.behavior.callRpc("getThreadExecutionDetails", {
        threadId: "thr_1",
      }),
    ).resolves.toEqual({ model: "gpt-6", reasoningLevel: "high" });
    harness.inspection.sdk.stub("threads.defaultExecutionOptions", async () => null);
    await expect(
      harness.behavior.callRpc("getThreadExecutionDetails", {
        threadId: "thr_1",
      }),
    ).resolves.toBeNull();
  });
});
