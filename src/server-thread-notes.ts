import type { ServerContext } from "./server-context";
import { THREAD_NOTES_CHANNEL } from "./contract";
import { isTurnInFlight } from "./lifecycle";
import { lastLineOf, type ThreadNote } from "./thread-note";

/** How often a working thread's latest message is read, at most. */
const PROGRESS_INTERVAL_MS = 3_000;

export const THREAD_NOTES_MIGRATION = `CREATE TABLE IF NOT EXISTS thread_notes (
  thread_id   TEXT PRIMARY KEY,
  agent_note  TEXT,
  auto_note   TEXT
)`;

interface NoteRow {
  thread_id: string;
  agent_note: string | null;
  auto_note: string | null;
}

/**
 * Each thread's note (see `thread-note.ts`). The agent's note and the
 * automatic line are kept apart: a message from the user clears only the
 * agent's, and the automatic one is replaced at every turn's end.
 */
export function createServerThreadNotes(ctx: ServerContext) {
  const publish = (threadId: string) => ctx.bb.realtime.publish(THREAD_NOTES_CHANNEL, { threadId });

  const write = (threadId: string, column: "agent_note" | "auto_note", text: string | null): void => {
    const current = ctx.db.prepare(`SELECT ${column} AS note FROM thread_notes WHERE thread_id = ?`).get(threadId) as
      | { note: string | null }
      | undefined;
    if ((current?.note ?? null) === text) return;
    ctx.db
      .prepare(
        `INSERT INTO thread_notes (thread_id, ${column}) VALUES (?, ?)
         ON CONFLICT(thread_id) DO UPDATE SET ${column} = excluded.${column}`,
      )
      .run(threadId, text);
    ctx.db.prepare(`DELETE FROM thread_notes WHERE agent_note IS NULL AND auto_note IS NULL`).run();
    publish(threadId);
  };

  const list = (): Record<string, ThreadNote> =>
    Object.fromEntries(
      (ctx.db.prepare(`SELECT thread_id, agent_note, auto_note FROM thread_notes`).all() as NoteRow[]).flatMap(
        (row): Array<[string, ThreadNote]> => {
          if (row.agent_note) return [[row.thread_id, { text: row.agent_note, by: "agent" }]];
          if (row.auto_note) return [[row.thread_id, { text: row.auto_note, by: "auto" }]];
          return [];
        },
      ),
    );

  const remove = (threadId: string): void => {
    const { changes } = ctx.db.prepare(`DELETE FROM thread_notes WHERE thread_id = ?`).run(threadId);
    if (changes > 0) publish(threadId);
  };

  // While a turn runs, the automatic line follows the agent's latest message.
  // Each thread reads at most once per interval, and always once more after
  // the last event, so the newest progress line is never missed. A turn's end
  // bumps the generation, so a read still in flight cannot overwrite the
  // final headline.
  const lastRead = new Map<string, number>();
  const pending = new Map<string, ReturnType<typeof setTimeout>>();
  const generation = new Map<string, number>();
  // The last turn's final reply, which the output read returns until the next
  // turn writes something new.
  const finals = new Map<string, string | null>();
  const readProgress = async (threadId: string) => {
    const started = generation.get(threadId) ?? 0;
    lastRead.set(threadId, Date.now());
    try {
      const { output } = await ctx.bb.sdk.threads.output({ threadId });
      const line = lastLineOf(output);
      if (line && line !== finals.get(threadId) && (generation.get(threadId) ?? 0) === started) {
        write(threadId, "auto_note", line);
      }
    } catch {
      // A thread can vanish mid-turn; its next event or turn end catches up.
    }
  };
  const followProgress = (thread: { id: string; status: Parameters<typeof isTurnInFlight>[0]; visibility: string }) => {
    if (thread.visibility !== "visible" || !isTurnInFlight(thread.status) || pending.has(thread.id)) return;
    const wait = Math.max(0, PROGRESS_INTERVAL_MS - (Date.now() - (lastRead.get(thread.id) ?? 0)));
    const timer = setTimeout(() => {
      pending.delete(thread.id);
      void readProgress(thread.id);
    }, wait);
    timer.unref?.();
    pending.set(thread.id, timer);
  };
  const settle = (threadId: string, headline: string | null) => {
    clearTimeout(pending.get(threadId));
    pending.delete(threadId);
    generation.set(threadId, (generation.get(threadId) ?? 0) + 1);
    write(threadId, "auto_note", headline);
  };
  /** A turn finished: its final line is the headline until the next turn. */
  const endTurn = (threadId: string, headline: string | null) => {
    finals.set(threadId, headline);
    settle(threadId, headline);
  };
  /** The user answered: the old headline is spent, and the agent's agenda too. */
  const userReplied = (threadId: string) => {
    write(threadId, "agent_note", null);
    settle(threadId, null);
  };
  ctx.bb.onDispose(() => {
    for (const timer of pending.values()) clearTimeout(timer);
    pending.clear();
  });

  return {
    list,
    remove,
    followProgress,
    endTurn,
    userReplied,
    setAgentNote: (threadId: string, text: string | null) => write(threadId, "agent_note", text),
    setAutoNote: (threadId: string, text: string | null) => write(threadId, "auto_note", text),
  };
}
