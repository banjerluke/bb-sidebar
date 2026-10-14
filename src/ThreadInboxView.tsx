import type { useSidebarThreads } from "./bb-sdk";
import type { RefObject, ReactNode } from "react";
import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import { ThreadListLoading, ActiveEmptyState, WorkingEmptyState } from "./ThreadInboxEmptyStates";
import {
  CompactShelf,
  DockableShelves,
  CollapsibleShelf,
  ProjectGroups,
  Shelf,
  SETTLED_PAGE_SIZE,
} from "./ThreadInboxShelves";
import { ACTIVE_SORT_MODES, isActiveSortMode, type ActiveSortMode, type ProjectViewUnit } from "./inbox-layout";
import { Icon } from "./components/Icon";
import { cn } from "./lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger } from "./components/Select";
import { ProjectScopeSelect } from "./ProjectScopeSelect";
import type { ThreadReorderControls } from "./ThreadCard";
import { SearchResults } from "./SearchResults";
import { useInboxEnvironment, useInboxActions, useInboxActivity } from "./InboxContext";
import { SCROLL_FADE_CLASS } from "./useScrollFade";

export interface ShelfExpansionState {
  active: boolean;
  pinned: boolean;
  working: boolean;
  inactive: boolean;
  parked: boolean;
  snoozed: boolean;
  settled: boolean;
}

const ACTIVE_SORT_LABELS: Record<ActiveSortMode, string> = {
  manual: "Manual order",
  activity: "Recent activity",
  created: "Date created",
  project: "Project",
};

interface ShelfThreads {
  threads: readonly PluginSidebarThread[];
  visibleThreads: readonly PluginSidebarThread[];
}

interface ThreadInboxViewProps {
  shelves: Record<"pinned" | "inbox" | "working" | "inactive" | "snoozed" | "parked" | "settled", ShelfThreads>;
  jumpHintsRootRef: RefObject<HTMLDivElement | null>;
  scope: readonly string[];
  reorderAnnouncement: string;
  attachScrollFadeRef: (node: HTMLDivElement | null) => void;
  status: ReturnType<typeof useSidebarThreads>["status"];
  isSearching: boolean;
  searchResults: readonly PluginSidebarThread[];
  wokeThreadIds: ReadonlySet<string>;
  dockShelvesEnabled: boolean;
  attachShelvesAutoAnimateRef: (node: HTMLDivElement | null) => void;
  attachDockAutoAnimateRef: (node: HTMLDivElement | null) => void;
  expandedShelves: ShelfExpansionState;
  renderActiveThread: (
    thread: PluginSidebarThread,
    shelf: "pinned" | "inbox",
    reorderable?: boolean,
    showProject?: boolean,
    compact?: boolean,
    renameShelf?: "active" | "working" | "inactive",
  ) => ReactNode;
  activeSortMode: ActiveSortMode;
  inboxProjectView: readonly ProjectViewUnit[];
  reorderControls: (key: string, shelf: "pinned" | "inbox", title: string) => ThreadReorderControls;
  sortedVisibleInbox: readonly PluginSidebarThread[];
  settledLimit: number;
}

export function ThreadInboxView({
  shelves,
  jumpHintsRootRef,
  scope,
  reorderAnnouncement,
  attachScrollFadeRef,
  status,
  isSearching,
  searchResults,
  wokeThreadIds,
  dockShelvesEnabled,
  attachShelvesAutoAnimateRef,
  attachDockAutoAnimateRef,
  expandedShelves,
  renderActiveThread,
  activeSortMode,
  inboxProjectView,
  reorderControls,
  sortedVisibleInbox,
  settledLimit,
}: ThreadInboxViewProps) {
  const { projects, projectIconRevision, projectNameById, lifecycle } = useInboxEnvironment();
  const { activeThreadId, now } = useInboxActivity();
  const { onNavigate, setScope, setExpandedShelves, setActiveSortMode, setSettledLimit } = useInboxActions();
  const { pinned, inbox, working, inactive, snoozed, parked, settled } = shelves;
  return (
    <div ref={jumpHintsRootRef} data-bb-sidebar-root="" className="flex min-h-0 flex-1 flex-col">
      {/* Project scope is plugin-owned; New thread and search live in bb's chrome. */}
      <div className="flex shrink-0 items-center gap-1 px-2 pb-1">
        <ProjectScopeSelect
          scope={scope}
          projects={projects}
          projectIconRevision={projectIconRevision}
          onScopeChange={setScope}
        />
      </div>

      {isSearching && scope.length > 0 ? (
        <p className="px-3 pb-1 text-2xs text-muted-foreground">
          Searching {scope.length === 1 ? "selected project" : `${scope.length} selected projects`}
        </p>
      ) : null}

      <p role="status" aria-live="polite" className="sr-only">
        {reorderAnnouncement}
      </p>

      <div ref={attachScrollFadeRef} className={cn("min-h-0 flex-1 overflow-y-auto px-1.5 pb-2", SCROLL_FADE_CLASS)}>
        {status === "loading" ? (
          <ThreadListLoading />
        ) : status === "error" ? (
          <p role="status" className="px-2 py-6 text-center text-xs text-muted-foreground">
            Could not load threads.
          </p>
        ) : isSearching && searchResults.length === 0 ? (
          <p role="status" className="px-2 py-6 text-center text-xs text-muted-foreground">
            No threads found
          </p>
        ) : isSearching ? (
          <SearchResults
            threads={searchResults}
            projectNameById={projectNameById}
            projectIconRevision={projectIconRevision}
            activeThreadId={activeThreadId}
            now={now}
            wokeThreadIds={wokeThreadIds}
            onAcknowledgeWake={(threadId) => void lifecycle.acknowledgeWake(threadId)}
            onNavigate={onNavigate}
          />
        ) : (
          <DockableShelves
            docked={dockShelvesEnabled}
            attachUpperRef={attachShelvesAutoAnimateRef}
            attachLowerRef={attachDockAutoAnimateRef}
            upper={
              <>
                {pinned.threads.length > 0 ? (
                  <CollapsibleShelf
                    label="Pinned"
                    icon="Pin"
                    count={pinned.threads.length}
                    expanded={expandedShelves.pinned}
                    onToggle={() =>
                      setExpandedShelves((current) => ({
                        ...current,
                        pinned: !current.pinned,
                      }))
                    }
                  >
                    <Shelf label={null}>
                      {pinned.visibleThreads.map((thread) => renderActiveThread(thread, "pinned"))}
                    </Shelf>
                  </CollapsibleShelf>
                ) : null}
                {inbox.threads.length > 0 ? (
                  <CollapsibleShelf
                    label="Active"
                    icon="Pulse"
                    count={inbox.threads.length}
                    expanded={expandedShelves.active}
                    onToggle={() =>
                      setExpandedShelves((current) => ({
                        ...current,
                        active: !current.active,
                      }))
                    }
                    action={
                      <Select
                        value={activeSortMode}
                        onValueChange={(value) => {
                          if (isActiveSortMode(value)) setActiveSortMode(value);
                        }}
                      >
                        <SelectTrigger
                          aria-label={`Sort active threads: ${ACTIVE_SORT_LABELS[activeSortMode]}`}
                          title={`Sort active threads: ${ACTIVE_SORT_LABELS[activeSortMode]}`}
                          className={cn(
                            "absolute bottom-1 right-[1.875rem] z-10 size-4 h-4 w-4 border-0 p-0 text-muted-foreground/40 shadow-none hover:bg-sidebar-accent hover:text-muted-foreground focus:ring-0 focus-visible:ring-1 focus-visible:ring-ring [&>svg:last-child]:hidden",
                            activeSortMode !== "manual" && "bg-sidebar-accent/60 text-muted-foreground/80",
                          )}
                        >
                          <Icon name="ArrowUpDown" className="size-3" />
                        </SelectTrigger>
                        <SelectContent align="end" className="min-w-40">
                          {ACTIVE_SORT_MODES.map((mode) => (
                            <SelectItem key={mode} value={mode} className="text-xs">
                              {ACTIVE_SORT_LABELS[mode]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    }
                  >
                    {activeSortMode === "project" ? (
                      <ProjectGroups
                        units={inboxProjectView}
                        reorderControls={(unit, name) => reorderControls(unit.key, "inbox", `${name} project`)}
                        renderThread={(thread, grouped) => renderActiveThread(thread, "inbox", true, !grouped)}
                      />
                    ) : inbox.visibleThreads.length > 0 ? (
                      <Shelf label={null}>
                        {sortedVisibleInbox.map((thread) => renderActiveThread(thread, "inbox"))}
                      </Shelf>
                    ) : null}
                  </CollapsibleShelf>
                ) : null}
                {pinned.threads.length === 0 &&
                inbox.threads.length === 0 &&
                working.threads.length === 0 &&
                inactive.threads.length === 0 ? (
                  <ActiveEmptyState />
                ) : null}
                {pinned.threads.length === 0 &&
                inbox.threads.length === 0 &&
                working.threads.length > 0 &&
                inactive.threads.length === 0 ? (
                  <WorkingEmptyState />
                ) : null}
              </>
            }
            lower={
              <>
                {working.threads.length > 0 ? (
                  <CollapsibleShelf
                    label="Working"
                    icon="Loading"
                    animateIcon
                    count={working.threads.length}
                    expanded={expandedShelves.working}
                    onToggle={() =>
                      setExpandedShelves((current) => ({
                        ...current,
                        working: !current.working,
                      }))
                    }
                  >
                    <Shelf label={null}>
                      {/* One line, like every shelf after Active. */}
                      {working.visibleThreads.map((thread) =>
                        renderActiveThread(thread, "inbox", false, true, true, "working"),
                      )}
                    </Shelf>
                  </CollapsibleShelf>
                ) : null}
                {inactive.threads.length > 0 ? (
                  <CollapsibleShelf
                    label="Inactive"
                    icon="PauseCircle"
                    count={inactive.threads.length}
                    expanded={expandedShelves.inactive}
                    onToggle={() =>
                      setExpandedShelves((current) => ({
                        ...current,
                        inactive: !current.inactive,
                      }))
                    }
                  >
                    <Shelf label={null}>
                      {inactive.visibleThreads.map((thread) =>
                        renderActiveThread(thread, "inbox", false, true, false, "inactive"),
                      )}
                    </Shelf>
                  </CollapsibleShelf>
                ) : null}
                <CompactShelf
                  label="Snoozed"
                  icon="Clock"
                  threads={snoozed.threads}
                  expanded={expandedShelves.snoozed}
                  onToggle={() =>
                    setExpandedShelves((current) => ({
                      ...current,
                      snoozed: !current.snoozed,
                    }))
                  }
                  shelf="snoozed"
                  visibleThreads={snoozed.visibleThreads}
                />
                <CompactShelf
                  label="Parked"
                  icon="Car"
                  threads={parked.threads}
                  expanded={expandedShelves.parked}
                  onToggle={() =>
                    setExpandedShelves((current) => ({
                      ...current,
                      parked: !current.parked,
                    }))
                  }
                  shelf="parked"
                  visibleThreads={parked.visibleThreads}
                />
                <CompactShelf
                  label="Settled"
                  icon="Meditation"
                  threads={settled.threads}
                  expanded={expandedShelves.settled}
                  onToggle={() =>
                    setExpandedShelves((current) => ({
                      ...current,
                      settled: !current.settled,
                    }))
                  }
                  shelf="settled"
                  visibleThreads={settled.visibleThreads}
                  settledLimit={settledLimit}
                  onLoadMore={() => setSettledLimit((limit) => limit + SETTLED_PAGE_SIZE)}
                />
              </>
            }
          />
        )}
      </div>
    </div>
  );
}
