/**
 * A project icon the user types instead of uploads: one or two characters
 * drawn on the project's colour (`SM`, `7`, `←`, `♪`), or a single emoji
 * drawn bare (`🎸`).
 */
export type ProjectGlyph = { kind: "text"; text: string } | { kind: "emoji"; text: string };

/** A letter, digit, symbol, or punctuation mark: anything visible but space. */
const CHARACTER = /^[\p{L}\p{N}\p{S}\p{P}]$/u;

function graphemes(text: string): string[] {
  return [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(text)].map((part) => part.segment);
}

/**
 * Drawn in colour by default (🎸), or asked to be (➡️, ❤️), or built from
 * several code points (👩🏽‍💻, 🇨🇦). A plain symbol such as ← or ❤ is text.
 */
function isEmoji(grapheme: string): boolean {
  return (
    /\p{Emoji_Presentation}|️|\p{Regional_Indicator}/u.test(grapheme) ||
    (/\p{Extended_Pictographic}/u.test(grapheme) && [...grapheme].length > 1)
  );
}

/** What the user typed, as a glyph, or null when it is neither 1–2 characters nor one emoji. */
export function parseProjectGlyph(input: string): ProjectGlyph | null {
  const text = input.trim();
  const parts = graphemes(text);
  if (parts.length === 1 && isEmoji(parts[0]!)) return { kind: "emoji", text };
  if (parts.length >= 1 && parts.length <= 2 && parts.every((part) => CHARACTER.test(part) && !isEmoji(part))) {
    return { kind: "text", text };
  }
  return null;
}
