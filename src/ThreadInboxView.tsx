import type { Dispatch, RefObject, SetStateAction, ReactNode } from "react";
import type { PluginSidebarThread, experimental_useSidebarThreads as useSidebarThreads } from "@get-bb/plugin-sdk/app";
import { ThreadListLoading, ActiveEmptyState, WorkingEmptyState } from "./ThreadInboxEmptyStates";
import {
  CompactShelf,
  DockableShelves,
  CollapsibleShelf,
  ProjectGroups,
  Shelf,
  SETTLED_PAGE_SIZE,
} from "./ThreadInboxShelves";
import { ListAnimationContext, type ListAnimationController } from "./useListAutoAnimate";
import { ACTIVE_SORT_MODES, isActiveSortMode, type ActiveSortMode, type ProjectViewUnit } from "./inbox-layout";
import { Icon } from "./components/Icon";
import { cn } from "./lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger } from "./components/Select";
import { ProjectScopeSelect } from "./ProjectScopeSelect";
import { ProjectColorsProvider } from "./ProjectColors";
import type { ThreadReorderControls } from "./ThreadCard";
import { SearchResults } from "./SearchResults";
import { ChildThreadDisplayContext, type ChildThreadDisplay } from "./ChildThreadDisplay";
import type { LifecycleApi } from "./useLifecycle";
import { WorkingSinceContext } from "./useWorkingSince";
import type { WorkingSince } from "./working-since";
import { JumpHintsContext } from "./JumpHints";
import { OpenPortsProvider } from "./OpenPorts";
import type { ConfiguredSnoozePreset } from "./lifecycle";
import { DEFAULT_SIDEBAR_SETTINGS, type SidebarSettingsValues } from "./sidebar-settings";
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

interface ThreadInboxViewProps {
  listAnimationController: ListAnimationController;
  sidebarSettings: SidebarSettingsValues | null;
  projects: ReturnType<typeof useSidebarThreads>["projects"];
  workingSince: WorkingSince;
  childDisplay: ChildThreadDisplay;
  jumpHints: ReadonlyMap<string, string>;
  jumpHintsRootRef: RefObject<HTMLDivElement | null>;
  scope: string;
  projectIconRevision: number;
  setScope: Dispatch<SetStateAction<string>>;
  reorderAnnouncement: string;
  attachScrollFadeRef: (node: HTMLDivElement | null) => void;
  status: ReturnType<typeof useSidebarThreads>["status"];
  isSearching: boolean;
  searchResults: readonly PluginSidebarThread[];
  projectNameById: ReadonlyMap<string, string>;
  activeThreadId: string | null;
  now: number;
  wokeThreadIds: ReadonlySet<string>;
  lifecycle: LifecycleApi;
  onNavigate: () => void;
  dockShelvesEnabled: boolean;
  attachShelvesAutoAnimateRef: (node: HTMLDivElement | null) => void;
  attachDockAutoAnimateRef: (node: HTMLDivElement | null) => void;
  pinned: readonly PluginSidebarThread[];
  expandedShelves: ShelfExpansionState;
  setExpandedShelves: Dispatch<SetStateAction<ShelfExpansionState>>;
  visiblePinned: readonly PluginSidebarThread[];
  renderActiveThread: (
    thread: PluginSidebarThread,
    shelf: "pinned" | "inbox",
    reorderable?: boolean,
    showProject?: boolean,
    compact?: boolean,
    renameShelf?: "active" | "working" | "inactive",
  ) => ReactNode;
  inbox: readonly PluginSidebarThread[];
  activeSortMode: ActiveSortMode;
  setActiveSortMode: Dispatch<SetStateAction<ActiveSortMode>>;
  inboxProjectView: readonly ProjectViewUnit[];
  toggleProjectCollapse: (projectId: string) => void;
  reorderControls: (key: string, shelf: "pinned" | "inbox", title: string) => ThreadReorderControls;
  visibleInbox: readonly PluginSidebarThread[];
  sortedVisibleInbox: readonly PluginSidebarThread[];
  working: readonly PluginSidebarThread[];
  inactive: readonly PluginSidebarThread[];
  visibleWorking: readonly PluginSidebarThread[];
  visibleInactive: readonly PluginSidebarThread[];
  parkThread: (thread: PluginSidebarThread) => void;
  settleThread: (thread: PluginSidebarThread) => void;
  snoozeThread: (thread: PluginSidebarThread, until: number) => void;
  snoozed: readonly PluginSidebarThread[];
  snoozePresets: readonly ConfiguredSnoozePreset[];
  visibleSnoozed: readonly PluginSidebarThread[];
  parked: readonly PluginSidebarThread[];
  visibleParked: readonly PluginSidebarThread[];
  settled: readonly PluginSidebarThread[];
  visibleSettled: readonly PluginSidebarThread[];
  settledLimit: number;
  setSettledLimit: Dispatch<SetStateAction<number>>;
}

export function ThreadInboxView({
  listAnimationController,
  sidebarSettings,
  projects,
  workingSince,
  childDisplay,
  jumpHints,
  jumpHintsRootRef,
  scope,
  projectIconRevision,
  setScope,
  reorderAnnouncement,
  attachScrollFadeRef,
  status,
  isSearching,
  searchResults,
  projectNameById,
  activeThreadId,
  now,
  wokeThreadIds,
  lifecycle,
  onNavigate,
  dockShelvesEnabled,
  attachShelvesAutoAnimateRef,
  attachDockAutoAnimateRef,
  pinned,
  expandedShelves,
  setExpandedShelves,
  visiblePinned,
  renderActiveThread,
  inbox,
  activeSortMode,
  setActiveSortMode,
  inboxProjectView,
  toggleProjectCollapse,
  reorderControls,
  visibleInbox,
  sortedVisibleInbox,
  working,
  inactive,
  visibleWorking,
  visibleInactive,
  parkThread,
  settleThread,
  snoozeThread,
  snoozed,
  snoozePresets,
  visibleSnoozed,
  parked,
  visibleParked,
  settled,
  visibleSettled,
  settledLimit,
  setSettledLimit,
}: ThreadInboxViewProps) {
  return (
    <ListAnimationContext.Provider value={listAnimationController}>
      <ProjectColorsProvider
        enabled={sidebarSettings?.projectColorsEnabled === true}
        display={sidebarSettings?.projectColorDisplay ?? DEFAULT_SIDEBAR_SETTINGS.projectColorDisplay}
        projectIds={projects.map((project) => project.id)}
      >
        <WorkingSinceContext.Provider value={workingSince}>
          <ChildThreadDisplayContext.Provider value={childDisplay}>
            <OpenPortsProvider>
              <JumpHintsContext.Provider value={jumpHints}>
                <div ref={jumpHintsRootRef} data-bb-sidebar-root="" className="flex min-h-0 flex-1 flex-col">
                  {/* The one control the host has no equivalent for. Everything else in
            the chrome above — New thread, search — is bb's and stays bb's. */}
                  <div className="flex shrink-0 items-center gap-1 px-2 pb-1">
                    <ProjectScopeSelect
                      scope={scope}
                      projects={projects}
                      projectIconRevision={projectIconRevision}
                      onScopeChange={setScope}
                    />
                  </div>

                  <p role="status" aria-live="polite" className="sr-only">
                    {reorderAnnouncement}
                  </p>

                  <div
                    ref={attachScrollFadeRef}
                    className={cn("min-h-0 flex-1 overflow-y-auto px-1.5 pb-2", SCROLL_FADE_CLASS)}
                  >
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
                            {pinned.length > 0 ? (
                              <CollapsibleShelf
                                label="Pinned"
                                icon="Pin"
                                count={pinned.length}
                                expanded={expandedShelves.pinned}
                                onToggle={() =>
                                  setExpandedShelves((current) => ({
                                    ...current,
                                    pinned: !current.pinned,
                                  }))
                                }
                              >
                                <Shelf label={null}>
                                  {visiblePinned.map((thread) => renderActiveThread(thread, "pinned"))}
                                </Shelf>
                              </CollapsibleShelf>
                            ) : null}
                            {inbox.length > 0 ? (
                              <CollapsibleShelf
                                label="Active"
                                icon="Pulse"
                                count={inbox.length}
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
                                    projectNameById={projectNameById}
                                    projectIconRevision={projectIconRevision}
                                    onToggle={toggleProjectCollapse}
                                    reorderControls={(unit, name) =>
                                      reorderControls(unit.key, "inbox", `${name} project`)
                                    }
                                    renderThread={(thread, grouped) =>
                                      renderActiveThread(thread, "inbox", true, !grouped)
                                    }
                                  />
                                ) : visibleInbox.length > 0 ? (
                                  <Shelf label={null}>
                                    {sortedVisibleInbox.map((thread) => renderActiveThread(thread, "inbox"))}
                                  </Shelf>
                                ) : null}
                              </CollapsibleShelf>
                            ) : null}
                            {pinned.length === 0 &&
                            inbox.length === 0 &&
                            working.length === 0 &&
                            inactive.length === 0 ? (
                              <ActiveEmptyState />
                            ) : null}
                            {pinned.length === 0 &&
                            inbox.length === 0 &&
                            working.length > 0 &&
                            inactive.length === 0 ? (
                              <WorkingEmptyState />
                            ) : null}
                          </>
                        }
                        lower={
                          <>
                            {working.length > 0 ? (
                              <CollapsibleShelf
                                label="Working"
                                icon="Loading"
                                animateIcon
                                count={working.length}
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
                                  {visibleWorking.map((thread) =>
                                    renderActiveThread(thread, "inbox", false, true, true, "working"),
                                  )}
                                </Shelf>
                              </CollapsibleShelf>
                            ) : null}
                            {inactive.length > 0 ? (
                              <CollapsibleShelf
                                label="Inactive"
                                icon="PauseCircle"
                                count={inactive.length}
                                expanded={expandedShelves.inactive}
                                onToggle={() =>
                                  setExpandedShelves((current) => ({
                                    ...current,
                                    inactive: !current.inactive,
                                  }))
                                }
                              >
                                <Shelf label={null}>
                                  {visibleInactive.map((thread) =>
                                    renderActiveThread(thread, "inbox", false, true, false, "inactive"),
                                  )}
                                </Shelf>
                              </CollapsibleShelf>
                            ) : null}
                            <CompactShelf
                              label="Snoozed"
                              onPark={parkThread}
                              onSettle={settleThread}
                              onSnooze={snoozeThread}
                              icon="Clock"
                              threads={snoozed}
                              projectNameById={projectNameById}
                              expanded={expandedShelves.snoozed}
                              onToggle={() =>
                                setExpandedShelves((current) => ({
                                  ...current,
                                  snoozed: !current.snoozed,
                                }))
                              }
                              shelf="snoozed"
                              visibleThreads={visibleSnoozed}
                              activeThreadId={activeThreadId}
                              lifecycle={lifecycle}
                              snoozePresets={snoozePresets}
                              onNavigate={onNavigate}
                              projectIconRevision={projectIconRevision}
                            />
                            <CompactShelf
                              label="Parked"
                              onPark={parkThread}
                              onSettle={settleThread}
                              onSnooze={snoozeThread}
                              icon="Car"
                              threads={parked}
                              projectNameById={projectNameById}
                              expanded={expandedShelves.parked}
                              onToggle={() =>
                                setExpandedShelves((current) => ({
                                  ...current,
                                  parked: !current.parked,
                                }))
                              }
                              shelf="parked"
                              visibleThreads={visibleParked}
                              activeThreadId={activeThreadId}
                              lifecycle={lifecycle}
                              snoozePresets={snoozePresets}
                              onNavigate={onNavigate}
                              projectIconRevision={projectIconRevision}
                            />
                            <CompactShelf
                              label="Settled"
                              onPark={parkThread}
                              onSettle={settleThread}
                              onSnooze={snoozeThread}
                              icon="Meditation"
                              threads={settled}
                              projectNameById={projectNameById}
                              expanded={expandedShelves.settled}
                              onToggle={() =>
                                setExpandedShelves((current) => ({
                                  ...current,
                                  settled: !current.settled,
                                }))
                              }
                              shelf="settled"
                              visibleThreads={visibleSettled}
                              activeThreadId={activeThreadId}
                              lifecycle={lifecycle}
                              snoozePresets={snoozePresets}
                              onNavigate={onNavigate}
                              projectIconRevision={projectIconRevision}
                              settledLimit={settledLimit}
                              onLoadMore={() => setSettledLimit((limit) => limit + SETTLED_PAGE_SIZE)}
                            />
                          </>
                        }
                      />
                    )}
                  </div>
                </div>
              </JumpHintsContext.Provider>
            </OpenPortsProvider>
          </ChildThreadDisplayContext.Provider>
        </WorkingSinceContext.Provider>
      </ProjectColorsProvider>
    </ListAnimationContext.Provider>
  );
}
