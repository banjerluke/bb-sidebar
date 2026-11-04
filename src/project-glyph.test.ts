import { describe, expect, it } from "vitest";
import { parseProjectGlyph } from "./project-glyph";

describe("parseProjectGlyph", () => {
  it("takes one or two letters or digits, trimmed", () => {
    expect(parseProjectGlyph(" SM ")).toEqual({ kind: "letters", text: "SM" });
    expect(parseProjectGlyph("7")).toEqual({ kind: "letters", text: "7" });
  });

  it("takes one emoji, including joined and flag sequences", () => {
    for (const emoji of ["🎸", "👩🏽‍💻", "🇨🇦"])
      expect(parseProjectGlyph(emoji)).toEqual({ kind: "emoji", text: emoji });
  });

  it("refuses anything else", () => {
    for (const input of ["", "SMA", "🎸🎸", "#", "S🎸"]) expect(parseProjectGlyph(input)).toBeNull();
  });
});
