import { ThreadPullRequest } from "./ThreadMetadata";
import { IconGutter, ThreadStateLine } from "./ThreadStateLine";
import { CompactRow } from "./CompactRow";
import { WokeMarker } from "./WokeMarker";
import { ShortcutHint, useSidebarThreadSplit, useThreadActions } from "./bb-sdk";
import { useId, useEffect, useRef, useState, type KeyboardEventHandler, type PointerEventHandler } from "react";
import { useSidebarThreadShortcut, type PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import { ChildThreadBadge, ChildThreadList, collapsedChildThreads } from "./ChildThreadList";
import { Icon } from "./components/Icon";
import { Tooltip } from "./components/Tooltip";
import { ThreadDetailsTooltip } from "./ThreadDetailsTooltip";
import { MoreActionsSelect } from "./MoreActionsSelect";
import { SettleButton } from "./SettleButton";
import { cn } from "./lib/utils";
import { rowKeyshortcuts } from "./lib/keyshortcuts";
import { RowContextMenu } from "./RowContextMenu";
import { STATUS_SLOT_CLASS, ThreadAge } from "./StatusSlot";
import { CompactStatusOrTime } from "./StatusGlyph";
import { threadDisplayTitle } from "./inbox";
import { InlineThreadTitle } from "./InlineThreadTitle";
import { isWorkingTree } from "./working-tree";
import { ProjectFavicon, ProjectStripe } from "./ProjectFavicon";
import { useProjectColor } from "./ProjectColors";
import { useInboxEnvironment, useInboxActions, useInboxActivity } from "./InboxContext";
import { DEFAULT_SIDEBAR_SETTINGS } from "./sidebar-settings";
import { projectIconUrl as iconUrl } from "./project-icons";
import { useArchiveThread } from "./useArchiveThread";
import { useRestoreRowFocus } from "./useRestoreRowFocus";
import "./settle-button.css";

/** How long the settle sweep plays before the thread actually moves. */
const SETTLE_SWEEP_MS = 520;
/** A settle that worked has unmounted the card by now; one that failed has not. */
const SETTLE_RECOVER_MS = 4_000;

function shouldAnimateSettle(): boolean {
  return typeof window.matchMedia === "function" && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export interface ThreadReorderControls {
  disabled: boolean;
  isDragging: boolean;
  onPointerDown: PointerEventHandler<HTMLElement>;
  onKeyDown: KeyboardEventHandler<HTMLElement>;
}

/**
 * Two-line card, or one line in compact mode: the title and age, then what
 * the thread is doing or waiting on. Outside a project group the project icon
 * leads the title. Status follows manual reorders. Controls sit above a
 * full-bleed anchor for valid markup and keyboard access.
 */
export function ThreadCard({
  thread,
  showProject = true,
  projectIconOnly = false,
  isActive,
  isWoke,
  canPark,
  childThreads,
  childrenExpanded,
  reorder,
  compactWhenWorking = false,
  compactAlways = false,
  onRenamingChange,
}: {
  thread: PluginSidebarThread;
  /** False when a group header already names the project. */
  showProject?: boolean;
  projectIconOnly?: boolean;
  isActive: boolean;
  /** A snooze ended and has not yet been acknowledged. */
  isWoke: boolean;
  /** False while the thread is working or blocked on the user. */
  canPark: boolean;
  childThreads: readonly PluginSidebarThread[];
  childrenExpanded: boolean;
  reorder?: ThreadReorderControls;
  /** Experimental: show threads with live work as a single line. */
  compactWhenWorking?: boolean;
  /** Compact all threads: one line regardless of work, woke state included. */
  compactAlways?: boolean;
  onRenamingChange?: (editing: boolean) => void;
}) {
  const [pin] = useThreadActions(thread, { keys: ["bb--core/pin"] });
  const {
    projectNameById,
    projectIconRevision,
    snoozePresets,
    childrenByParentId: childrenByParent,
    sidebarSettings,
    lifecycle,
    threadNotes,
  } = useInboxEnvironment();
  const { onNavigate, parkThread, settleThread, snoozeThread, acknowledgeWake, toggleChildExpansion } =
    useInboxActions();
  const { activeThreadId, now } = useInboxActivity();
  const projectName = projectNameById.get(thread.projectId) ?? null;
  const projectIconUrl = iconUrl(thread.projectId, projectIconRevision);
  const showRunningChildrenWhenCollapsed =
    sidebarSettings?.showRunningChildrenWhenCollapsed ?? DEFAULT_SIDEBAR_SETTINGS.showRunningChildrenWhenCollapsed;
  const onPark = () => parkThread(thread);
  const onSettle = () => settleThread(thread);
  const onSnooze = (until: number) => snoozeThread(thread, until);
  const onArchive = useArchiveThread(thread);
  const onAcknowledgeWake = () => acknowledgeWake(thread.id);
  const onToggleChildren = () => toggleChildExpansion(thread.id);
  const shortcut = useSidebarThreadShortcut(thread.id);
  const { splitProps, layout } = useSidebarThreadSplit(thread.id);
  const rowRef = useRef<HTMLLIElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  useEffect(() => {
    const row = rowRef.current;
    if (!row) return;
    if (typeof IntersectionObserver === "undefined") {
      setIsVisible(true);
      return;
    }
    const observer = new IntersectionObserver(([entry]) => {
      setIsVisible(entry?.isIntersecting ?? false);
    });
    observer.observe(row);
    return () => observer.disconnect();
  }, []);
  const [isRenaming, setIsRenaming] = useState(false);
  useRestoreRowFocus(rowRef, thread.id);
  const compactAtRenameStart = useRef(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isSettling, setIsSettling] = useState(false);
  const settleTimer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (settleTimer.current !== null) window.clearTimeout(settleTimer.current);
    },
    [],
  );
  // The sweep plays before the settle is sent, so the row leaves in its
  // finished state instead of vanishing under the cursor.
  const startSettle = () => {
    if (isSettling) return;
    if (!shouldAnimateSettle()) {
      onSettle();
      return;
    }
    setIsSettling(true);
    settleTimer.current = window.setTimeout(() => {
      onSettle();
      settleTimer.current = window.setTimeout(() => setIsSettling(false), SETTLE_RECOVER_MS);
    }, SETTLE_SWEEP_MS);
  };
  // The sweep keeps the actions up, as an open menu does, so the check it
  // starts from does not disappear when the cursor leaves the row.
  const holdParkActions = isMenuOpen || isSettling;
  const childListId = useId();
  // Keep busy trees compact until a failure, question, or wake needs attention.
  const naturalCompact =
    compactAlways || (compactWhenWorking && !isWoke && isWorkingTree(thread, childThreads, childrenByParent));
  const compact = isRenaming ? compactAtRenameStart.current : naturalCompact;
  const stripeView = compact ? "collapsed" : "full";
  const projectColor = useProjectColor(thread.projectId);
  const changeRenaming = (editing: boolean) => {
    if (editing) compactAtRenameStart.current = compact;
    setIsRenaming(editing);
    onRenamingChange?.(editing);
  };
  // Collapsed cards leave their child rows behind the expansion badge.
  const showChildrenWhenCollapsed = showRunningChildrenWhenCollapsed && !compact;
  const emphasis = isWoke ? "woke" : thread.isUnread ? "unread" : thread.indicator === "none" ? "read-idle" : "active";
  const showParkActions = !isWoke && canPark;

  const unpinButton = thread.isPinned ? (
    <Tooltip label="Unpin thread">
      <button
        type="button"
        aria-label={`Unpin ${threadDisplayTitle(thread)}`}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          void pin?.action.run();
        }}
        className={cn(
          "shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground",
          "pointer-events-auto",
          (compact || !showParkActions) &&
            "opacity-0 transition-opacity duration-150 ease-out focus-visible:opacity-100 group-hover/card:opacity-100 motion-reduce:transition-none [@media(hover:none)]:opacity-100",
        )}
      >
        <Icon name="PinOff" className="size-3.5" />
      </button>
    </Tooltip>
  ) : null;

  const titleLine = (
    <div
      data-row-emphasis={emphasis}
      data-settle-fade=""
      className={cn(
        "pointer-events-none relative truncate text-sm",
        "min-w-0 flex-1",
        isRenaming && "pointer-events-auto",
        emphasis === "read-idle" ? "text-muted-foreground" : "text-foreground",
        (emphasis === "unread" || emphasis === "woke") && "font-medium",
      )}
    >
      <InlineThreadTitle thread={thread} editing={isRenaming} onEditingChange={changeRenaming} />
    </div>
  );

  return (
    <RowContextMenu
      thread={thread}
      onPark={canPark ? onPark : undefined}
      canSnooze={canPark}
      canArchive={canPark}
      snoozePresets={snoozePresets}
      onSnooze={onSnooze}
      onSettle={canPark ? startSettle : undefined}
      onRename={() => changeRenaming(true)}
    >
      <li
        ref={rowRef}
        className={cn(
          "list-none",
          // The row stays in the flow — the list reorders around it — but it
          // is drawn over its neighbours rather than under them, so its shadow
          // and ring are not clipped by the rows it sits between.
          reorder?.isDragging && "relative z-20",
        )}
      >
        <div data-drag-visual="">
          {compact ? (
            <CompactRow
              thread={thread}
              tone="normal"
              showProject={showProject}
              projectIconOnly={projectIconOnly}
              projectName={projectName}
              projectIconUrl={projectIconUrl}
              projectColor={projectColor}
              label={threadDisplayTitle(thread)}
              isActive={isActive}
              isSplitOpen={layout !== null}
              isDragging={!!reorder?.isDragging}
              isRenaming={isRenaming}
              onRenamingChange={changeRenaming}
              onOpen={() => {
                if (isWoke) onAcknowledgeWake();
                onNavigate();
              }}
              rowProps={{ "data-parent-card": "", "data-settling": isSettling ? "" : undefined }}
              linkProps={{
                draggable: false,
                "aria-keyshortcuts": rowKeyshortcuts(shortcut?.ariaKeyshortcuts, !!reorder),
                onPointerDown: (event) => {
                  splitProps.onPointerDown?.(event);
                  reorder?.onPointerDown(event);
                },
                onKeyDown: reorder?.onKeyDown,
                // Vertical panning stays with the scroller during reordering.
                className: cn(
                  "absolute inset-0 touch-pan-y rounded-md",
                  reorder && !reorder.disabled ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
                ),
              }}
              beforeContent={isSettling ? <span aria-hidden="true" className="bb-sidebar-settle-sweep" /> : null}
              fadeContent
              trailing={
                <span className="pointer-events-none relative flex shrink-0 items-center gap-1.5">
                  {childThreads.length > 0 ? (
                    <ChildThreadBadge
                      threads={childThreads}
                      childrenByParent={childrenByParent}
                      expanded={childrenExpanded}
                      controls={childListId}
                      onToggle={onToggleChildren}
                    />
                  ) : null}
                  {shortcut ? (
                    <ShortcutHint shortcut={shortcut} />
                  ) : (
                    <>
                      {unpinButton}
                      {isWoke ? <WokeMarker onDismiss={onAcknowledgeWake} /> : null}
                      <CompactStatusOrTime thread={thread} now={now} />
                    </>
                  )}
                </span>
              }
            />
          ) : (
            <div
              data-parent-card=""
              data-settling={isSettling ? "" : undefined}
              className={cn(
                "group/card relative rounded-md px-2.5 transition-colors duration-150 ease-out motion-reduce:transition-none",
                compact ? "flex h-8 items-center gap-2 text-xs" : "py-2",
                isActive ? "bg-sidebar-accent" : "hover:bg-sidebar-accent/60",
                // A thread open in another pane gets a weaker tint than the active
                // row, so the two states stay distinguishable.
                !isActive && layout !== null && "bg-sidebar-accent/30",
                // Lifted, not faded: the row under the cursor is the one the user
                // is acting on, so it should read as the most present thing on the
                // shelf. The two stacked gradients put an opaque sidebar base under
                // the accent tint, because a translucent row would let the rows it
                // passes over show straight through it.
                reorder?.isDragging &&
                  "bg-[linear-gradient(var(--sidebar-accent),var(--sidebar-accent)),linear-gradient(var(--sidebar),var(--sidebar))] shadow-lg ring-1 ring-sidebar-border",
              )}
            >
              {isSettling ? <span aria-hidden="true" className="bb-sidebar-settle-sweep" /> : null}
              {showProject && projectName ? <ProjectStripe projectId={thread.projectId} view={stripeView} /> : null}
              <ThreadDetailsTooltip thread={thread} disabled={isRenaming || !!reorder?.isDragging}>
                <a
                  // Both attributes, or bb's nine thread shortcuts stop finding rows.
                  data-sidebar-thread-shortcut-target=""
                  data-sidebar-thread-id={thread.id}
                  href={thread.href}
                  aria-label={threadDisplayTitle(thread)}
                  aria-current={isActive ? "page" : undefined}
                  draggable={false}
                  aria-keyshortcuts={rowKeyshortcuts(shortcut?.ariaKeyshortcuts, !!reorder)}
                  onPointerDown={(event) => {
                    splitProps.onPointerDown?.(event);
                    reorder?.onPointerDown(event);
                  }}
                  onKeyDown={reorder?.onKeyDown}
                  onClick={(event) => {
                    if (isRenaming || event.detail > 1) {
                      event.preventDefault();
                      return;
                    }
                    if (isWoke) onAcknowledgeWake();
                    onNavigate();
                  }}
                  onDoubleClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    changeRenaming(true);
                  }}
                  className={cn(
                    // Vertical panning stays with the scroller; this row never
                    // claims a touch gesture for reordering.
                    "absolute inset-0 touch-pan-y rounded-md",
                    reorder && !reorder.disabled ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
                  )}
                />
              </ThreadDetailsTooltip>
              <div className="pointer-events-none relative flex h-5 min-w-0 items-center gap-1.5">
                <IconGutter>
                  {showProject && projectName ? (
                    <ProjectFavicon
                      projectId={thread.projectId}
                      src={projectIconUrl}
                      name={projectName}
                      className="size-3.5"
                    />
                  ) : null}
                </IconGutter>
                {titleLine}
                {/* Show bb's thread shortcut in place of the status while the modifier is held. */}
                {shortcut ? (
                  <span className={cn(STATUS_SLOT_CLASS, "w-auto")}>
                    <ShortcutHint shortcut={shortcut} />
                  </span>
                ) : isWoke ? (
                  <span className={cn(STATUS_SLOT_CLASS, "w-auto gap-1.5")}>
                    {unpinButton}
                    <WokeMarker onDismiss={onAcknowledgeWake} />
                    <ThreadAge thread={thread} now={now} />
                  </span>
                ) : (
                  <span
                    className={cn(
                      STATUS_SLOT_CLASS,
                      "group/status-slot pointer-events-auto relative h-5",
                      // Sized to the age; the actions need a little more room on hover.
                      "w-auto min-w-0",
                      showParkActions &&
                        "[@media(hover:none)]:gap-1.5 [@media(hover:hover)]:group-hover/card:min-w-10 has-[:focus-visible]:min-w-10",
                      holdParkActions && "min-w-10",
                    )}
                  >
                    <span
                      className={cn(
                        "flex items-center justify-end gap-0.5 transition-opacity duration-150 ease-out motion-reduce:transition-none",
                        showParkActions &&
                          "[@media(hover:hover)]:group-hover/card:opacity-0 [@media(hover:hover)]:group-has-[:focus-visible]/status-slot:opacity-0 [@media(hover:none)]:static [@media(hover:none)]:opacity-100",
                        holdParkActions && "opacity-0 [@media(hover:none)]:opacity-100",
                      )}
                    >
                      {!showParkActions ? unpinButton : null}
                      <ThreadAge thread={thread} now={now} />
                    </span>
                    {showParkActions ? (
                      <span
                        className={cn(
                          "pointer-events-none absolute inset-y-0 right-0 flex items-center gap-0.5 opacity-0 transition-opacity duration-150 ease-out has-[:focus-visible]:pointer-events-auto has-[:focus-visible]:opacity-100 group-hover/card:pointer-events-auto group-hover/card:opacity-100 [@media(hover:none)]:static [@media(hover:none)]:pointer-events-auto [@media(hover:none)]:opacity-100 motion-reduce:transition-none",
                          holdParkActions && "pointer-events-auto opacity-100",
                        )}
                      >
                        {unpinButton}
                        <SettleButton label="Settle thread" settling={isSettling} onActivate={startSettle} />
                        <MoreActionsSelect
                          label="Snooze, park, or archive"
                          snoozePresets={snoozePresets}
                          triggerClassName="h-5 w-4 justify-center rounded-md border-0 px-0 py-0 text-muted-foreground shadow-none duration-200 ease-out hover:bg-transparent hover:duration-200 hover:text-foreground focus:ring-0 focus-visible:text-foreground data-[state=open]:text-foreground motion-reduce:transition-none"
                          onOpenChange={setIsMenuOpen}
                          onSnooze={onSnooze}
                          onPark={onPark}
                          onArchive={onArchive}
                        />
                      </span>
                    ) : null}
                  </span>
                )}
              </div>
              <ThreadStateLine
                thread={thread}
                now={now}
                note={threadNotes.get(thread.id) ?? null}
                inputs={{
                  childNeedsYou: lifecycle.childNeedsYou(thread),
                  settlesOnceRead: lifecycle.settlesOnceRead(thread),
                  children: childThreads,
                  childrenByParent,
                }}
                trailing={
                  <>
                    {childThreads.length > 0 ? (
                      <ChildThreadBadge
                        threads={childThreads}
                        childrenByParent={childrenByParent}
                        expanded={childrenExpanded}
                        controls={childListId}
                        onToggle={onToggleChildren}
                      />
                    ) : null}
                    {isVisible ? <ThreadPullRequest environmentId={thread.environment?.id ?? null} /> : null}
                  </>
                }
              />
            </div>
          )}
          {childThreads.length > 0 &&
          (childrenExpanded ||
            collapsedChildThreads(childThreads, childrenByParent, activeThreadId, showChildrenWhenCollapsed).length >
              0) ? (
            <ChildThreadList
              id={childListId}
              threads={childThreads}
              expanded={childrenExpanded}
              showRunningChildrenWhenCollapsed={showChildrenWhenCollapsed}
              parentProjectId={thread.projectId}
              variant="sidebar"
            />
          ) : null}
        </div>
      </li>
    </RowContextMenu>
  );
}
