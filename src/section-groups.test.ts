import { describe, expect, it } from "vitest";
import type { PluginSidebarSection, PluginSidebarThread } from "@get-bb/plugin-sdk";
import { idleSidebarThreadFields } from "./test-fixtures";
import { emptySectionHint, layoutActiveSections, orderSectionIds } from "./section-groups";

function section(id: string): PluginSidebarSection {
  return { id, name: id.toUpperCase(), createdAt: 1, updatedAt: 1 };
}

function thread(id: string, sectionId: string | null): PluginSidebarThread {
  return { ...idleSidebarThreadFields, id, sectionId } as PluginSidebarThread;
}

describe("orderSectionIds", () => {
  it("keeps the saved order, skips deleted ids, and appends new sections in creation order", () => {
    const sections = [section("a"), section("b"), section("c"), section("d")];
    expect(orderSectionIds(sections, ["c", "gone", "a"])).toEqual(["c", "a", "b", "d"]);
    expect(orderSectionIds(sections, null)).toEqual(["a", "b", "c", "d"]);
  });
});

describe("layoutActiveSections", () => {
  it("groups rows by section in header order, keeping row order, and lists empty sections", () => {
    const sections = [section("a"), section("b"), section("c")];
    const rows = [thread("1", "b"), thread("2", null), thread("3", "a"), thread("4", "gone"), thread("5", "b")];
    const layout = layoutActiveSections(rows, sections, ["b", "c", "a"]);
    expect(layout.groups.map((group) => [group.key, group.threads.map((row) => row.id)])).toEqual([
      ["section:b", ["1", "5"]],
      ["section:a", ["3"]],
    ]);
    expect(layout.empty.map((empty) => empty.id)).toEqual(["c"]);
    // A deleted section's rows read as unsectioned.
    expect(layout.loose.map((row) => row.id)).toEqual(["2", "4"]);
  });
});

describe("emptySectionHint", () => {
  it("counts the section's threads on other shelves, or says it has none", () => {
    const elsewhere = [
      ["pinned", [thread("1", "a")]],
      ["parked", [thread("2", "a"), thread("3", "a"), thread("4", "b")]],
      ["settled", []],
    ] as const;
    expect(emptySectionHint("a", elsewhere)).toBe("1 pinned · 2 parked");
    expect(emptySectionHint("c", elsewhere)).toBe("No threads");
  });
});
