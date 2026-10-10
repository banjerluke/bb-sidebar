import { describe, expect, it } from "vitest";
import { MONOGRAM_COLOR_COUNT, projectMonogramColor, projectMonogramLetter } from "./project-monogram";

describe("projectMonogramLetter", () => {
  it.each([
    ["bb-sidebar", "S"],
    ["bb-plugin-tasks", "T"],
    ["the-app", "A"],
    ["@acme/widgets", "W"],
    ["org/repo-name", "R"],
    ["myProject", "P"],
    ["Sidebar", "S"],
    ["bb", "B"],
    ["2fa-server", "2"],
    ["ölçüm", "Ö"],
    ["  ", "#"],
    ["---", "#"],
  ])("%j → %s", (name, letter) => {
    expect(projectMonogramLetter(name)).toBe(letter);
  });
});

describe("projectMonogramColor", () => {
  it("is stable for a name, ignoring case and outer spaces", () => {
    expect(projectMonogramColor("bb-sidebar")).toBe(projectMonogramColor(" BB-Sidebar "));
  });

  it("stays inside the palette and spreads similar names", () => {
    const colors = new Set(Array.from({ length: 40 }, (_, index) => projectMonogramColor(`project-${index}`)));
    for (const color of colors) {
      expect(color).toBeGreaterThanOrEqual(0);
      expect(color).toBeLessThan(MONOGRAM_COLOR_COUNT);
    }
    expect(colors.size).toBeGreaterThan(MONOGRAM_COLOR_COUNT / 2);
  });
});
