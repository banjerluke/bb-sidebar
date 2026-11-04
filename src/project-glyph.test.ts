import { describe, expect, it } from "vitest";
import { parseProjectGlyph } from "./project-glyph";

describe("parseProjectGlyph", () => {
  it("takes one or two characters of any kind, trimmed", () => {
    for (const text of ["SM", "7", "←", "→←", "♪", "λ", "#"])
      expect(parseProjectGlyph(` ${text} `)).toEqual({ kind: "text", text });
  });

  it("takes one emoji, including colour-requested, joined, and flag sequences", () => {
    for (const text of ["🎸", "➡️", "👩🏽‍💻", "🇨🇦"]) expect(parseProjectGlyph(text)).toEqual({ kind: "emoji", text });
  });

  it("refuses anything longer, spaced, or mixing an emoji with more", () => {
    for (const input of ["", "SMA", "a b", "🎸🎸", "S🎸"]) expect(parseProjectGlyph(input)).toBeNull();
  });
});
