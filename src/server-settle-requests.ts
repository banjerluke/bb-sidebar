import type { ServerContext, ServerHandlers } from "./server-context";
import type { CleanupThread, createServerLifecycle } from "./server-lifecycle";
import { LIFECYCLE_CHANNEL } from "./contract";
import { canPark } from "./lifecycle";
import { decideSettleRequest, type SettleRequestDecision } from "./settle-request";

export const SETTLE_REQUESTS_MIGRATION = `CREATE TABLE IF NOT EXISTS settle_requests (
  thread_id     TEXT PRIMARY KEY,
  requested_at  INTEGER NOT NULL
)`;

/** Every shelf choice the user makes overrides a waiting settle. */
const USER_SHELF_ACTIONS = ["settle", "unsettle", "resume", "pin", "park", "snooze", "unsnooze"] as const;
type ShelfHandlers = Pick<ServerHandlers, (typeof USER_SHELF_ACTIONS)[number]>;

/**
 * Settles that wait for the thread to finish and for you to read it (see
 * `settle-request.ts`). The request lives in its own table so a lifecycle row
 * keeps meaning only what the user chose.
 */
export function createServerSettleRequests(
  ctx: ServerContext,
  lifecycle: ReturnType<typeof createServerLifecycle>,
  settle: (threadId: string) => Promise<unknown>,
) {
  const { loadPolicyThreads, threadSignals, settleTree } = lifecycle;

  const list = (): string[] =>
    (
      ctx.db.prepare(`SELECT thread_id FROM settle_requests ORDER BY requested_at`).all() as Array<{
        thread_id: string;
      }>
    ).map((row) => row.thread_id);

  const publish = (threadIds: readonly string[]) => {
    if (threadIds.length > 0) ctx.bb.realtime.publish(LIFECYCLE_CHANNEL, { threadIds });
  };

  const drop = (threadId: string): void => {
    const { changes } = ctx.db.prepare(`DELETE FROM settle_requests WHERE thread_id = ?`).run(threadId);
    if (changes > 0) publish([threadId]);
  };

  const add = (threadId: string): void => {
    ctx.db
      .prepare(`INSERT INTO settle_requests (thread_id, requested_at) VALUES (?, ?) ON CONFLICT(thread_id) DO NOTHING`)
      .run(threadId, Date.now());
    publish([threadId]);
  };

  // The whole tree settles together, so any busy descendant makes it wait.
  const decide = (threads: readonly CleanupThread[], threadId: string): SettleRequestDecision => {
    const tree = settleTree(threads, threadId);
    const root = tree.find((thread) => thread.id === threadId)!;
    return decideSettleRequest({
      failed: root.status === "error" || root.queuedWork === "failed",
      busy: tree.some((thread) => !canPark(threadSignals(thread))),
      isUnread: threadSignals(root).isUnread,
    });
  };

  /** `bb sidebar settle`: settle now when nothing is left to see, else wait. */
  const request = async (threadId: string): Promise<"settled" | "requested"> => {
    const decision = decide(await loadPolicyThreads(true), threadId);
    if (decision === "drop") throw new Error("Cannot settle a thread whose last turn failed");
    if (decision === "settle") {
      await settle(threadId);
      drop(threadId);
      return "settled";
    }
    add(threadId);
    return "requested";
  };

  let pass: Promise<string[]> | null = null;
  /** Carry out every request whose thread is now idle and read. */
  const resolve = (): Promise<string[]> => {
    if (list().length === 0) return Promise.resolve([]);
    pass ??= (async () => {
      const threads = await loadPolicyThreads(true);
      const live = new Set(threads.map((thread) => thread.id));
      const settled: string[] = [];
      for (const threadId of list()) {
        if (!live.has(threadId)) {
          drop(threadId); // Archived, deleted, or hidden since.
          continue;
        }
        const decision = decide(threads, threadId);
        if (decision === "drop") drop(threadId);
        if (decision !== "settle") continue;
        try {
          await settle(threadId);
          drop(threadId);
          settled.push(threadId);
        } catch {
          // The tree changed under the settle; the next pass tries again.
        }
      }
      return settled;
    })().finally(() => {
      pass = null;
    });
    return pass;
  };

  /** Wrap the user's shelf actions so each one cancels a waiting settle. */
  const overriddenBy = <H extends ShelfHandlers>(handlers: H): H => {
    const wrapped = { ...handlers };
    for (const name of USER_SHELF_ACTIONS) {
      const original = handlers[name] as (input: { threadId: string }) => Promise<unknown>;
      (wrapped as Record<string, unknown>)[name] = async (input: { threadId: string }, ...rest: unknown[]) => {
        const result = await (original as (...args: unknown[]) => Promise<unknown>)(input, ...rest);
        drop(input.threadId);
        return result;
      };
    }
    return wrapped;
  };

  return { list, drop, request, resolve, overriddenBy };
}
