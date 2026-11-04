import { describe, expect, it } from "vitest";
import { makeThreadResponse } from "@get-bb/plugin-sdk/testing";
import { loadPlugin, projectThread, projectsWith, type LifecycleListResult, type ProjectThread } from "./test-server";

// An agent settling its own thread: mid-turn, so nothing it has said is read yet.
const working = (): ProjectThread =>
  projectThread({ id: "thr_1", status: "active", runtime: { displayStatus: "active" }, latestAttentionAt: 10 });
const finished = (overrides: Partial<ProjectThread> = {}): ProjectThread =>
  projectThread({ id: "thr_1", latestAttentionAt: 20, lastReadAt: 10, ...overrides });
const read = (overrides: Partial<ProjectThread> = {}): ProjectThread => finished({ lastReadAt: 20, ...overrides });

async function setup() {
  const harness = await loadPlugin();
  let thread = working();
  harness.inspection.sdk.stub("projects.list", async () => projectsWith([thread]));
  const state = async () => ({
    requested: ((await harness.behavior.callRpc("listSettleRequests", {})) as { threadIds: string[] }).threadIds,
    settled:
      ((await harness.behavior.callRpc("listLifecycle", {})) as LifecycleListResult).rows.find(
        (row) => row.threadId === "thr_1",
      )?.settledAt != null,
  });
  return {
    harness,
    state,
    become: (next: ProjectThread) => {
      thread = next;
    },
    settleSelf: () => harness.behavior.runCli(["settle"], { threadId: "thr_1" }),
    pass: () => harness.behavior.runSchedule("settle-requests"),
  };
}

describe("an agent settling its own thread", () => {
  it("waits for the turn to end and for the user to read it", async () => {
    const { state, become, settleSelf, pass } = await setup();
    expect(await settleSelf()).toMatchObject({ exitCode: 0, stdout: expect.stringContaining("will settle once") });
    expect(await state()).toEqual({ requested: ["thr_1"], settled: false });

    become(finished());
    await pass();
    expect(await state()).toEqual({ requested: ["thr_1"], settled: false });

    become(read());
    await pass();
    expect(await state()).toEqual({ requested: [], settled: true });
  });

  it("settles right away when nothing is left to read", async () => {
    const { state, become, settleSelf } = await setup();
    become(read());
    expect(await settleSelf()).toMatchObject({ stdout: "settled thr_1\n" });
    expect(await state()).toEqual({ requested: [], settled: true });
  });

  it("is cancelled by a failed turn", async () => {
    const { harness, state, become, settleSelf, pass } = await setup();
    await settleSelf();
    await harness.behavior.emitThreadEvent("thread.failed", {
      thread: makeThreadResponse({ id: "thr_1", status: "error" }),
      error: "boom",
    });
    become(read({ status: "error" }));
    await pass();
    expect(await state()).toEqual({ requested: [], settled: false });
  });

  it("is cancelled by a message from the user but not from an agent", async () => {
    const { harness, state, settleSelf } = await setup();
    await settleSelf();
    const dispatch = harness.inspection.registrations.hooks["message.dispatch"]!;
    const send = (initiator: "agent" | "user") =>
      dispatch({ thread: makeThreadResponse({ id: "thr_1" }), initiator } as Parameters<typeof dispatch>[0]);

    expect(await send("agent")).toEqual({ action: "proceed" });
    expect((await state()).requested).toEqual(["thr_1"]);
    expect(await send("user")).toEqual({ action: "proceed" });
    expect((await state()).requested).toEqual([]);
  });

  it("is cancelled when the user picks a shelf themselves", async () => {
    const { harness, state, become, settleSelf, pass } = await setup();
    await settleSelf();
    await harness.behavior.callRpc("resume", { threadId: "thr_1" });
    become(read());
    await pass();
    expect(await state()).toEqual({ requested: [], settled: false });
  });
});
