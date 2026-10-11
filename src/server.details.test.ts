import { describe, expect, it } from "vitest";
import { loadPlugin } from "./test-server";

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
