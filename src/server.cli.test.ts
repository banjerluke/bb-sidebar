import { describe, expect, it } from "vitest";
import { makeThreadResponse } from "@get-bb/plugin-sdk/testing";
import plugin from "./server";
import { createFakePluginHost, disposers, loadPlugin, projectThread, projectsWith } from "./test-server";

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
    expect(JSON.parse(snoozed.stdout)).toMatchObject({
      threads: [{ threadId: "thr_1", shelf: "snoozed" }],
      total: 1,
      offset: 0,
      nextOffset: null,
    });
    expect(await harness.behavior.runCli(["list", "--all", "--state", "active"])).toMatchObject({
      stdout: "No threads\n",
    });
  });

  it("pages through every filter with --offset", async () => {
    const threads = ["thr_a", "thr_b", "thr_c", "thr_d", "thr_e"].map((id, index) =>
      projectThread({ id, title: id, latestAttentionAt: 100 - index, projectId: index < 4 ? "proj_1" : "proj_2" }),
    );
    const { bb, harness } = createFakePluginHost({
      pluginId: "bb-sidebar",
      sdk: {
        projects: { list: async () => projectsWith(threads) },
        threads: {
          get: async ({ threadId }) => makeThreadResponse({ id: threadId }),
          unpin: async ({ threadId }) => makeThreadResponse({ id: threadId }),
        },
      },
    });
    await plugin(bb);
    disposers.push(() => harness.lifecycle.dispose());
    const page = async (args: string[]) =>
      JSON.parse((await harness.behavior.runCli(["list", ...args, "--json"], { projectId: "proj_1" })).stdout) as {
        threads: { threadId: string }[];
        total: number;
        nextOffset: number | null;
      };
    const ids = (result: { threads: { threadId: string }[] }) => result.threads.map((thread) => thread.threadId);

    expect(await page(["--limit", "2"])).toMatchObject({ total: 4, nextOffset: 2 });
    expect(ids(await page(["--limit", "2", "--offset", "2"]))).toEqual(["thr_c", "thr_d"]);
    expect(await page(["--limit", "2", "--offset", "2"])).toMatchObject({ nextOffset: null });
    expect(ids(await page(["--all", "--limit", "2", "--offset", "4"]))).toEqual(["thr_e"]);

    await harness.behavior.runCli(["snooze", "1h", "--thread", "thr_b"]);
    await harness.behavior.runCli(["snooze", "1h", "--thread", "thr_d"]);
    expect(await page(["--state", "snoozed", "--limit", "1"])).toMatchObject({ total: 2, nextOffset: 1 });
    expect(ids(await page(["--state", "snoozed", "--limit", "1", "--offset", "1"]))).toEqual(["thr_d"]);

    const text = await harness.behavior.runCli(["list", "--limit", "2"], { projectId: "proj_1" });
    expect(text.stdout.trim().split("\n").at(-1)).toBe("Showing 1-2 of 4; next page: --offset 2");
    const past = await harness.behavior.runCli(["list", "--offset", "9"], { projectId: "proj_1" });
    expect(past.stdout).toBe("No threads at offset 9; 4 match\n");
  });

  it("needs exactly one of a parent or --clear", async () => {
    const harness = await loadPlugin();
    expect(await harness.behavior.runCli(["parent"], { threadId: "thr_1" })).toMatchObject({ exitCode: 1 });
    expect(await harness.behavior.runCli(["parent", "thr_2", "--clear"], { threadId: "thr_1" })).toMatchObject({
      exitCode: 1,
    });
  });
});
