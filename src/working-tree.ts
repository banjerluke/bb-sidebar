import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import { childStatusKind } from "./child-status";
import { isThreadWorking } from "./lifecycle";
import { threadShortStatus } from "./StatusSlot";

/**
 * Whether a thread, or anything under it, still has work running: its own
 * turn, its background agents, commands, workflows, and goals, and any
 * working descendant. The badge can prioritize unread success over a live
 * turn, so inspect activity as well as its displayed status.
 *
 * The thread itself needing you, or failing, outranks its children's work:
 * that is the user's cue, so such a thread never counts as working here.
 *
 * Decides both the compact row and the Working shelf.
 */
export function isWorkingTree(
  thread: PluginSidebarThread,
  childThreads: readonly PluginSidebarThread[],
  childrenByParent: ReadonlyMap<string, readonly PluginSidebarThread[]>,
): boolean {
  if (
    thread.hasPendingInteraction ||
    thread.indicator === "waiting-for-input" ||
    thread.indicator === "unread-error" ||
    thread.queuedWork === "failed"
  ) {
    return false;
  }
  if (threadShortStatus(thread)?.showsDuration === true || isThreadWorking(thread)) return true;
  const pending = [...childThreads];
  const seen = new Set<string>();
  while (pending.length > 0) {
    const child = pending.pop()!;
    if (child.isArchived || seen.has(child.id)) continue;
    seen.add(child.id);
    if (
      childStatusKind(child) === "working" ||
      (child.indicator !== "unread-error" &&
        child.indicator !== "waiting-for-input" &&
        !child.hasPendingInteraction &&
        child.queuedWork !== "failed" &&
        isThreadWorking(child))
    )
      return true;
    pending.push(...(childrenByParent.get(child.id) ?? []));
  }
  return false;
}
