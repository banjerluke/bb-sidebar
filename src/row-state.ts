import type { PluginSidebarThread } from "@get-bb/plugin-sdk";
import { childStatusKind, isWorkingIndicator } from "./child-status";
import { isThreadWorking } from "./lifecycle";

/**
 * What a row's second line says when bb's own indicator does not. bb knows
 * one thread at a time, so an idle parent whose children are busy or blocked
 * looks idle (or merely unread) there; these states name what it is waiting on.
 */
export type SidebarRowState =
  | { kind: "child-needs-you" }
  | { kind: "waiting-on-children"; count: number }
  | { kind: "settles-once-read" };

interface SidebarRowStateInputs {
  /** A child or grandchild waits on the user. */
  childNeedsYou: boolean;
  /** An agent asked to settle the thread once the user has read it. */
  settlesOnceRead: boolean;
  /** Direct children, for counting the ones still at work. */
  children: readonly PluginSidebarThread[];
  childrenByParent: ReadonlyMap<string, readonly PluginSidebarThread[]>;
}

function hasWork(thread: PluginSidebarThread, childrenByParent: SidebarRowStateInputs["childrenByParent"]): boolean {
  if (thread.isArchived) return false;
  if (childStatusKind(thread) === "working" || isThreadWorking(thread)) return true;
  return (childrenByParent.get(thread.id) ?? []).some((child) => hasWork(child, childrenByParent));
}

/**
 * The sidebar's own state for a row, or null to show bb's. A raised hand, a
 * failure, and live work in the thread itself always outrank what its
 * children are doing.
 */
export function sidebarRowState(thread: PluginSidebarThread, inputs: SidebarRowStateInputs): SidebarRowState | null {
  if (
    thread.hasPendingInteraction ||
    thread.queuedWork === "failed" ||
    thread.indicator === "unread-error" ||
    thread.indicator === "waiting-for-input" ||
    isWorkingIndicator(thread.indicator)
  ) {
    return null;
  }
  if (inputs.childNeedsYou) return { kind: "child-needs-you" };
  const count = inputs.children.filter((child) => hasWork(child, inputs.childrenByParent)).length;
  if (count > 0) return { kind: "waiting-on-children", count };
  if (inputs.settlesOnceRead) return { kind: "settles-once-read" };
  return null;
}

export function sidebarRowStateLabel(state: SidebarRowState): string {
  switch (state.kind) {
    case "child-needs-you":
      return "Child needs you";
    case "waiting-on-children":
      return state.count === 1 ? "Waiting on 1 child" : `Waiting on ${state.count} children`;
    case "settles-once-read":
      return "Settles once read";
  }
}

/** A sidebar status tone, as named by the `--bb-sidebar-tone-*` palette. */
type StatusTone = "error" | "pending" | "working" | "draft" | "success";

/**
 * The tone an unread row glows in: the colour of what is new in it. A
 * failure, then a question, then work still under way; anything else that
 * is unread is a finished result.
 */
export function unreadGlowTone(thread: PluginSidebarThread, own: SidebarRowState | null): StatusTone | null {
  if (!thread.isUnread) return null;
  if (thread.indicator === "unread-error" || thread.queuedWork === "failed") return "error";
  if (thread.hasPendingInteraction || thread.indicator === "waiting-for-input" || own?.kind === "child-needs-you") {
    return "pending";
  }
  if (own?.kind === "waiting-on-children" || isWorkingIndicator(thread.indicator)) return "working";
  if (thread.indicator === "draft") return "draft";
  return "success";
}
