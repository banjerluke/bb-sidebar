import { describe, expect, it } from "vitest";
import { makeThreadResponse } from "@get-bb/plugin-sdk/testing";
import { loadPlugin } from "./test-server";

async function setup() {
  const harness = await loadPlugin();
  const notes = async () =>
    ((await harness.behavior.callRpc("listThreadNotes", {})) as { notes: Record<string, unknown> }).notes;
  const finishTurn = (lastAssistantText: string) =>
    harness.behavior.emitThreadEvent("thread.idle", { thread: makeThreadResponse({ id: "thr_1" }), lastAssistantText });
  const dispatch = harness.inspection.registrations.hooks["message.dispatch"]!;
  const send = (initiator: "agent" | "user") =>
    dispatch({ thread: makeThreadResponse({ id: "thr_1" }), initiator } as Parameters<typeof dispatch>[0]);
  return { harness, notes, finishTurn, send };
}

describe("thread notes", () => {
  it("shows the last line of a finished turn until the agent sets its own note", async () => {
    const { harness, notes, finishTurn } = await setup();
    await finishTurn("Opened PR #212.\n\nWant me to merge it?");
    expect(await notes()).toEqual({ thr_1: { text: "Want me to merge it?", by: "auto" } });

    expect(await harness.behavior.runCli(["note", "Waiting for CI on #212"], { threadId: "thr_1" })).toMatchObject({
      exitCode: 0,
    });
    await finishTurn("Still waiting.");
    expect(await notes()).toEqual({ thr_1: { text: "Waiting for CI on #212", by: "agent" } });
  });

  it("clears the agent's note when the user sends a message, not when an agent does", async () => {
    const { harness, notes, finishTurn, send } = await setup();
    await finishTurn("Pushed the fix.");
    await harness.behavior.runCli(["note", "Waiting for Tyler"], { threadId: "thr_1" });

    expect(await send("agent")).toEqual({ action: "proceed" });
    expect((await notes()).thr_1).toEqual({ text: "Waiting for Tyler", by: "agent" });
    expect(await send("user")).toEqual({ action: "proceed" });
    expect((await notes()).thr_1).toEqual({ text: "Pushed the fix.", by: "auto" });
  });

  it("shows what a pending question asks", async () => {
    const { harness, notes } = await setup();
    await harness.behavior.emitThreadEvent("interaction.pending", {
      thread: makeThreadResponse({ id: "thr_1" }),
      interaction: { payload: { kind: "user_question", questions: [{ prompt: "Squash or merge?" }] } },
    } as never);
    expect(await notes()).toEqual({ thr_1: { text: "Squash or merge?", by: "auto" } });
  });

  it("clears on request and refuses an empty note", async () => {
    const { harness, notes } = await setup();
    await harness.behavior.runCli(["note", "Waiting"], { threadId: "thr_1" });
    expect(await harness.behavior.runCli(["note"], { threadId: "thr_1" })).toMatchObject({ exitCode: 1 });
    await harness.behavior.runCli(["note", "--clear"], { threadId: "thr_1" });
    expect(await notes()).toEqual({});
  });
});
