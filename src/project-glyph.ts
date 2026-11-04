/**
 * A project icon the user types instead of uploads: one or two letters or
 * digits drawn on the project's colour (`SM`, `bb`, `7`), or a single emoji
 * drawn bare (`🎸`).
 */
export type ProjectGlyph = { kind: "letters"; text: string } | { kind: "emoji"; text: string };

const LETTERS = /^[\p{L}\p{N}]{1,2}$/u;
const EMOJI = /\p{Extended_Pictographic}|\p{Regional_Indicator}/u;

function graphemes(text: string): string[] {
  return [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(text)].map((part) => part.segment);
}

/** What the user typed, as a glyph, or null when it is neither 1–2 letters nor one emoji. */
export function parseProjectGlyph(input: string): ProjectGlyph | null {
  const text = input.trim();
  if (LETTERS.test(text)) return { kind: "letters", text };
  const parts = graphemes(text);
  if (parts.length === 1 && EMOJI.test(parts[0]!)) return { kind: "emoji", text: parts[0]! };
  return null;
}
