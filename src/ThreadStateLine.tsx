import type { ReactNode } from "react";
import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import { ThreadStatusGlyph } from "./bb-sdk";
import { Icon, type IconName } from "./components/Icon";
import { cn } from "./lib/utils";
import { RateLimitRecovery } from "./RateLimitRecovery";
import { useThreadLimit } from "./RateLimits";
import { sidebarRowState, sidebarRowStateLabel, type SidebarRowState } from "./row-state";
import { StatusGlyph } from "./StatusGlyph";
import {
  shortStatusLabel,
  statusToneClass,
  threadShortStatus,
  useThreadRowStatus,
  useThreadWithDraft,
} from "./StatusSlot";
import { useWorkingSinceContext } from "./useWorkingSince";
import { isThreadWorking } from "./lifecycle";
import type { ThreadNote } from "./thread-note";

/**
 * The fixed first column of a card. The project icon sits in it on the title
 * line and the state glyph on the state line, so the title and the state text
 * share a left edge whether or not either icon is there.
 */
export function IconGutter({ children }: { children?: ReactNode }) {
  return <span className="flex size-3.5 shrink-0 items-center justify-center">{children}</span>;
}

const SIDEBAR_STATE_LOOK: Record<SidebarRowState["kind"], { icon: IconName; tone: string }> = {
  "child-needs-you": { icon: "CircleQuestion", tone: `${statusToneClass("waiting-for-input")} opacity-75` },
  "waiting-on-children": { icon: "Children", tone: statusToneClass("runtime") },
  "settles-once-read": { icon: "SettlesOnceRead", tone: statusToneClass("unread-success") },
};

interface LineState {
  glyph: ReactNode;
  label: ReactNode;
}

function useLineState(
  listedThread: PluginSidebarThread,
  inputs: Parameters<typeof sidebarRowState>[1],
  now: number,
): LineState | null {
  const thread = useThreadWithDraft(listedThread);
  const workingSince = useWorkingSinceContext();
  const limit = useThreadLimit(listedThread);
  const rowStatus = useThreadRowStatus(listedThread);
  if (limit && !thread.hasPendingInteraction && thread.indicator !== "runtime") {
    return {
      glyph: <Icon name="PauseCircle" aria-hidden className={cn("size-3.5", statusToneClass("waiting-for-input"))} />,
      label: <RateLimitRecovery thread={listedThread} />,
    };
  }
  const own = sidebarRowState(thread, inputs);
  if (own) {
    const look = SIDEBAR_STATE_LOOK[own.kind];
    return {
      glyph: <Icon name={look.icon} aria-hidden className={cn("size-3.5", look.tone)} />,
      label: <span className={cn("font-medium", look.tone)}>{sidebarRowStateLabel(own)}</span>,
    };
  }
  if (rowStatus) {
    return {
      glyph: <ThreadStatusGlyph indicator="none" rowStatus={rowStatus} size="compact" />,
      label: <span>{rowStatus.label}</span>,
    };
  }
  const status = threadShortStatus(thread);
  if (status === null) return null;
  const done = thread.indicator === "unread-success" && status.label === "Unread";
  const text = done ? "Done" : shortStatusLabel(status, workingSince.get(thread.id), now);
  // The glyph follows the label: a raised hand or a failed send outranks a
  // running indicator, as the label already does.
  const glyphIndicator = thread.hasPendingInteraction
    ? "waiting-for-input"
    : thread.queuedWork === "failed"
      ? "unread-error"
      : thread.indicator;
  return {
    glyph: done ? (
      <Icon name="CircleCheck" aria-hidden className={cn("size-3.5", status.className)} />
    ) : (
      <StatusGlyph indicator={glyphIndicator} label={null} />
    ),
    label: (
      <span
        aria-label={status.ariaLabel ?? (thread.hasPendingInteraction ? text : (thread.indicatorLabel ?? text))}
        className={cn("font-medium", status.showsDuration && "tabular-nums", status.className)}
      >
        {text}
      </span>
    ),
  };
}

function NoteFlag() {
  return <Icon name="Flag" aria-label="Agent's note" className="size-3 shrink-0 text-muted-foreground" />;
}

/**
 * A card's second line: what the thread is doing or waiting on, its note,
 * then the trailing badges. The sidebar's own states (a child that needs you,
 * children still working, a settle waiting on your read) come before bb's
 * indicator. The agent's note always shows; the automatic one would be stale
 * while the thread works, so it waits for the turn to end or for a question.
 */
export function ThreadStateLine({
  thread,
  inputs,
  note,
  now,
  trailing,
}: {
  thread: PluginSidebarThread;
  inputs: Parameters<typeof sidebarRowState>[1];
  note: ThreadNote | null;
  now: number;
  trailing: ReactNode;
}) {
  const state = useLineState(thread, inputs, now);
  const shownNote =
    note && (note.by === "agent" || thread.hasPendingInteraction || !isThreadWorking(thread)) ? note : null;
  const flagInGutter = !state && shownNote?.by === "agent";
  return (
    <div
      data-settle-fade=""
      data-state-line=""
      className="pointer-events-none relative mt-0.5 flex h-4 min-w-0 items-center gap-1.5 text-2xs text-muted-foreground"
    >
      <IconGutter>{flagInGutter ? <NoteFlag /> : state?.glyph}</IconGutter>
      <span className="flex min-w-0 flex-1 items-center gap-1">
        {state ? <span className="shrink-0">{state.label}</span> : null}
        {state && shownNote ? <span aria-hidden="true">·</span> : null}
        {state && shownNote?.by === "agent" ? <NoteFlag /> : null}
        {shownNote ? (
          <span
            title={shownNote.text}
            data-note={shownNote.by}
            className={cn("min-w-0 truncate", shownNote.by === "auto" && "text-muted-foreground/70")}
          >
            {shownNote.text}
          </span>
        ) : null}
      </span>
      {trailing}
    </div>
  );
}
