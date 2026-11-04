/**
 * A thread's note: one line under its title saying what it is up to or
 * waiting on. An agent sets its own with `bb sidebar note`, and a message
 * from the user clears it. Otherwise the row shows the last line of the
 * agent's latest message: its progress while a turn runs, its final headline
 * after, or what a pending question or approval asks.
 */
export interface ThreadNote {
  text: string;
  by: "agent" | "auto";
}

const THREAD_NOTE_MAX_LENGTH = 160;

function clip(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > THREAD_NOTE_MAX_LENGTH ? `${flat.slice(0, THREAD_NOTE_MAX_LENGTH - 1).trimEnd()}…` : flat;
}

/** An agent's note as stored: one line, clipped; empty means none. */
export function normalizeAgentNote(text: string): string | null {
  return clip(text) || null;
}

/** Markdown reduced to the words a reader would see on one line. */
function plainLine(line: string): string {
  return (
    line
      .replace(/^\s{0,3}(?:#{1,6}\s+|>\s?|[-*+]\s+|\d+[.)]\s+)/, "")
      .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/(\*\*|\*|~~|`)(.+?)\1/g, "$2")
      .trim()
      // A line set in _italics_ whole, such as an agent's headline. Underscores
      // inside a line stay, so snake_case names survive.
      .replace(/^_(.+)_$/, "$1")
  );
}

/**
 * The last line of an agent's final message worth showing: prose, not code,
 * a table row, a rule, or a fenced block such as a ```ui card.
 */
export function lastLineOf(text: string | null): string | null {
  if (!text) return null;
  const prose: string[] = [];
  let fenced = false;
  for (const line of text.split("\n")) {
    if (/^\s*(```|~~~)/.test(line)) {
      fenced = !fenced;
      continue;
    }
    if (fenced || /^\s*\|/.test(line) || /^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) continue;
    const plain = plainLine(line);
    if (plain) prose.push(plain);
  }
  const last = prose.at(-1);
  return last ? clip(last) : null;
}

type Json = Record<string, unknown>;
const record = (value: unknown): Json | null =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Json) : null;
const text = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value : null);

/**
 * What a pending question or approval asks, in a few words. bb adds kinds
 * over time, so anything unrecognized yields null rather than a guess.
 */
export function interactionSummary(interaction: unknown): string | null {
  const payload = record(record(interaction)?.payload);
  if (!payload) return null;
  if (payload.kind === "user_question") {
    const [first] = Array.isArray(payload.questions) ? payload.questions : [];
    const question = record(first);
    const asked = text(question?.shortLabel) ?? text(question?.prompt);
    return asked ? clip(asked) : null;
  }
  if (payload.kind === "approval") {
    const subject = record(payload.subject);
    const command = text(subject?.command);
    if (subject?.kind === "command" && command) return clip(`Approve: ${command}`);
    if (subject?.kind === "file_change") return "Approve file changes";
    if (subject?.kind === "plan") return "Approve the plan";
    const reason = text(payload.reason);
    return reason ? clip(reason) : "Approval requested";
  }
  if (payload.kind === "plugin") {
    const pending = text(record(record(record(payload.presentation)?.label))?.pending);
    return pending ? clip(pending) : null;
  }
  return null;
}
