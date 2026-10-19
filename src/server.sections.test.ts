import { describe, expect, it } from "vitest";
import { makeThreadResponse } from "@get-bb/plugin-sdk/testing";
import { loadPlugin } from "./test-server";

describe("section RPCs", () => {
  it("saves the section header order and announces it", async () => {
    const harness = await loadPlugin();
    await expect(harness.behavior.callRpc("listSectionOrder", {})).resolves.toEqual({ sectionIds: [] });
    await expect(harness.behavior.callRpc("reorderSections", { sectionIds: ["sec_b", "sec_a"] })).resolves.toEqual({
      sectionIds: ["sec_b", "sec_a"],
    });
    await harness.behavior.callRpc("reorderSections", { sectionIds: ["sec_a"] });
    await expect(harness.behavior.callRpc("listSectionOrder", {})).resolves.toEqual({ sectionIds: ["sec_a"] });
    expect(harness.inspection.realtimeSignals.filter((signal) => signal.channel === "section-order")).toHaveLength(2);
  });

  it("moves a thread with every descendant, archived ones included, and skips those already there", async () => {
    const harness = await loadPlugin();
    const threads = [
      makeThreadResponse({ id: "root", sectionId: null }),
      makeThreadResponse({ id: "child", parentThreadId: "root", sectionId: null }),
      makeThreadResponse({ id: "archived", parentThreadId: "root", sectionId: null, archivedAt: 5 }),
      makeThreadResponse({ id: "grandchild", parentThreadId: "child", sectionId: "sec_a" }),
    ];
    harness.inspection.sdk.stub(
      "threads.get",
      async ({ threadId }) => threads.find((thread) => thread.id === threadId)!,
    );
    harness.inspection.sdk.stub("threads.list", async ({ parentThreadId, archived, offset }) =>
      offset
        ? []
        : threads.filter(
            (thread) => thread.parentThreadId === parentThreadId && (thread.archivedAt !== null) === archived,
          ),
    );
    harness.inspection.sdk.stub(
      "threads.update",
      async ({ threadId }) => threads.find((thread) => thread.id === threadId)!,
    );
    await expect(
      harness.behavior.callRpc("moveThreadToSection", { threadId: "root", sectionId: "sec_a" }),
    ).resolves.toEqual({ movedThreadIds: ["root", "child", "archived"] });
    expect(harness.inspection.sdk.callsTo("threads.update")).toEqual([
      [{ threadId: "root", sectionId: "sec_a" }],
      [{ threadId: "child", sectionId: "sec_a" }],
      [{ threadId: "archived", sectionId: "sec_a" }],
    ]);
  });
});
