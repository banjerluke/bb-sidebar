import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import { ThreadCard, type ThreadReorderControls } from "./ThreadCard";
import type { useInboxContextValues } from "./InboxContext";
import type { ActiveSortMode } from "./inbox-layout";
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
  const { sidebarSettings, lifecycle, childrenByParentId } = environment;
  const settings = sidebarSettings ?? DEFAULT_SIDEBAR_SETTINGS;
  const { activeThreadId } = activity;
  const { setRenamingShelfLocks } = actions;
  const renderActiveThread = (
    thread: PluginSidebarThread,
    shelf: ActiveShelfKind,
    reorderable = true,
    showProject = true,
    compact = false,
    renameShelf: "active" | "working" | "inactive" = "active",
    showEnvironment = true,
  ) => (
    <ThreadCard
      key={thread.id}
      thread={thread}
      showProject={showProject}
      showEnvironment={showEnvironment}
      isActive={thread.id === activeThreadId}
      isWoke={wokeThreadIds.has(thread.id)}
      canPark={lifecycle.canPark(thread)}
      onRenamingChange={(editing) => {
        setRenamingShelfLocks((current) => {
          const next = new Map(current);
          if (editing) next.set(thread.id, renameShelf);
          else next.delete(thread.id);
          return next;
        });
      }}
      childThreads={childrenByParentId.get(thread.id) ?? []}
      childrenExpanded={expandedChildParentIds.has(thread.id)}
      reorder={
        !reorderable ||
        (shelf === "pinned" && thread.pinSortKey == null) ||
        (shelf === "inbox" && (activeSortMode === "activity" || activeSortMode === "created"))
          ? undefined
          : threadReorderControls(thread, shelf)
      }
      compactWhenWorking={compact || settings.threadDisplay === "compact-working"}
      compactAlways={
        settings.threadDisplay === "compact-all" &&
        !(shelf === "pinned" && settings.keepPinnedThreadsFull) &&
        !(wokeThreadIds.has(thread.id) && settings.keepWokeThreadsFull)
      }
    />
  );

  return renderActiveThread;
}
