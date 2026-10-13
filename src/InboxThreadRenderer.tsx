import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import { ThreadCard, type ThreadReorderControls } from "./ThreadCard";
import type { useInboxContextValues } from "./InboxContext";
import type { ActiveSortMode } from "./inbox-layout";
import { projectIconUrl } from "./project-icons";
import { DEFAULT_SIDEBAR_SETTINGS } from "./sidebar-settings";

type ActiveShelfKind = "pinned" | "inbox";

export function createInboxThreadRenderer(
  { environment, actions, activity }: ReturnType<typeof useInboxContextValues>,
  {
    wokeThreadIds,
    expandedChildParentIds,
    threadReorderControls,
    activeSortMode,
  }: {
    wokeThreadIds: ReadonlySet<string>;
    expandedChildParentIds: ReadonlySet<string>;
    threadReorderControls: (thread: PluginSidebarThread, shelf: ActiveShelfKind) => ThreadReorderControls;
    activeSortMode: ActiveSortMode;
  },
) {
  const {
    providerById,
    projectNameById,
    projectIconRevision,
    sidebarSettings,
    snoozePresets,
    lifecycle,
    childrenByParentId,
  } = environment;
  const { onNavigate, setRenamingShelfLocks, parkThread, settleThread, snoozeThread, toggleChildExpansion } = actions;
  const { activeThreadId, now } = activity;
  const renderActiveThread = (
    thread: PluginSidebarThread,
    shelf: ActiveShelfKind,
    reorderable = true,
    showProject = true,
    compact = false,
    renameShelf: "active" | "working" | "inactive" = "active",
  ) => (
    <ThreadCard
      key={thread.id}
      thread={thread}
      provider={providerById.get(thread.providerId) ?? null}
      projectName={projectNameById.get(thread.projectId) ?? null}
      projectIconUrl={projectIconUrl(thread.projectId, projectIconRevision)}
      showProject={showProject}
      isActive={thread.id === activeThreadId}
      isWoke={wokeThreadIds.has(thread.id)}
      canPark={lifecycle.canPark(thread)}
      snoozePresets={snoozePresets}
      onNavigate={onNavigate}
      onRenamingChange={(editing) => {
        setRenamingShelfLocks((current) => {
          const next = new Map(current);
          if (editing) next.set(thread.id, renameShelf);
          else next.delete(thread.id);
          return next;
        });
      }}
      onPark={() => parkThread(thread)}
      onSettle={() => settleThread(thread)}
      onSnooze={(until) => snoozeThread(thread, until)}
      onAcknowledgeWake={() => void lifecycle.acknowledgeWake(thread.id)}
      childThreads={childrenByParentId.get(thread.id) ?? []}
      childrenByParent={childrenByParentId}
      activeThreadId={activeThreadId}
      childrenExpanded={expandedChildParentIds.has(thread.id)}
      showRunningChildrenWhenCollapsed={
        sidebarSettings?.showRunningChildrenWhenCollapsed ?? DEFAULT_SIDEBAR_SETTINGS.showRunningChildrenWhenCollapsed
      }
      onToggleChildren={() => toggleChildExpansion(thread.id)}
      reorder={
        !reorderable ||
        (shelf === "pinned" && thread.pinSortKey == null) ||
        (shelf === "inbox" && (activeSortMode === "activity" || activeSortMode === "created"))
          ? undefined
          : threadReorderControls(thread, shelf)
      }
      compactWhenWorking={
        compact || (sidebarSettings?.compactWorkingThreads ?? DEFAULT_SIDEBAR_SETTINGS.compactWorkingThreads)
      }
      now={now}
    />
  );

  return renderActiveThread;
}
