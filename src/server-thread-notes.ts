import type { ServerContext } from "./server-context";
import { THREAD_NOTES_CHANNEL } from "./contract";
import type { ThreadNote } from "./thread-note";

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

  return {
    list,
    remove,
    setAgentNote: (threadId: string, text: string | null) => write(threadId, "agent_note", text),
    setAutoNote: (threadId: string, text: string | null) => write(threadId, "auto_note", text),
  };
}
