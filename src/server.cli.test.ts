import { describe, expect, it } from "vitest";
import { loadPlugin } from "./test-server";

const HOUR_MS = 60 * 60_000;

describe("bb sidebar CLI", () => {
  it("snoozes the calling thread by default", async () => {
    const harness = await loadPlugin();
    const before = Date.now();
    const result = await harness.behavior.runCli(["snooze", "2h"], { threadId: "thr_1" });
    expect(result).toMatchObject({ exitCode: 0, stdout: expect.stringMatching(/^snoozed thr_1 until /) });
    const { rows } = (await harness.behavior.callRpc("listLifecycle", {})) as {
      rows: { threadId: string; snoozedUntil: number }[];
    };
    expect(rows).toHaveLength(1);
    expect(rows[0]!.threadId).toBe("thr_1");
    expect(rows[0]!.snoozedUntil).toBeGreaterThanOrEqual(before + 2 * HOUR_MS);
    expect(rows[0]!.snoozedUntil).toBeLessThanOrEqual(Date.now() + 2 * HOUR_MS);
  });

  it("rejects wake times it cannot read and threads it cannot find", async () => {
    const harness = await loadPlugin();
    expect(await harness.behavior.runCli(["snooze", "soonish"], { threadId: "thr_1" })).toMatchObject({
      exitCode: 1,
      stderr: expect.stringContaining("tomorrow@09:00"),
    });
    expect(await harness.behavior.runCli(["settle"], {})).toMatchObject({
      exitCode: 1,
      stderr: expect.stringContaining("--thread"),
    });
    expect(await harness.behavior.callRpc("listLifecycle", {})).toEqual({ rows: [] });
  });

  it("resumes each shelf the way the sidebar does", async () => {
    const harness = await loadPlugin();
    await harness.behavior.runCli(["park", "--thread", "thr_1"]);
    expect(await harness.behavior.runCli(["resume", "--thread", "thr_1"])).toMatchObject({ exitCode: 0 });
    expect(await harness.behavior.callRpc("listLifecycle", {})).toMatchObject({
      rows: [{ parkedAt: null, settledOverride: "active" }],
    });
    await harness.behavior.runCli(["snooze", "1h", "--thread", "thr_1"]);
    await harness.behavior.runCli(["resume", "--thread", "thr_1"]);
    expect(await harness.behavior.callRpc("listLifecycle", {})).toEqual({ rows: [] });
    expect(await harness.behavior.runCli(["resume", "--thread", "thr_1"])).toMatchObject({
      stdout: "thr_1 is already active\n",
    });
  });

  it("lists threads by shelf", async () => {
    const harness = await loadPlugin();
    await harness.behavior.runCli(["snooze", "1d"], { threadId: "thr_1" });
    const snoozed = await harness.behavior.runCli(["list", "--all", "--state", "snoozed", "--json"]);
    expect(JSON.parse(snoozed.stdout)).toMatchObject([{ threadId: "thr_1", shelf: "snoozed" }]);
    expect(await harness.behavior.runCli(["list", "--all", "--state", "active"])).toMatchObject({
      stdout: "No threads\n",
    });
  });

  it("needs exactly one of a parent or --clear", async () => {
    const harness = await loadPlugin();
    expect(await harness.behavior.runCli(["parent"], { threadId: "thr_1" })).toMatchObject({ exitCode: 1 });
    expect(await harness.behavior.runCli(["parent", "thr_2", "--clear"], { threadId: "thr_1" })).toMatchObject({
      exitCode: 1,
    });
  });
});
