import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  experimental_useSidebarThreadActions as useSidebarThreadActions,
  experimental_useSidebarThreads as useSidebarThreads,
  experimental_useProviders as useProviders,
  type PluginSidebarThread,
  type PluginThreadListProps,
  useSettings,
} from "@get-bb/plugin-sdk/app";
import { useInboxShelfThreads } from "./useInboxShelfThreads";
import { createDragReorderHandler } from "./drag-reorder";
import type { InboxDragOrder } from "./drag-reorder-geometry";
import { ThreadInboxView, type ShelfExpansionState } from "./ThreadInboxView";
import { useQuantizedNow } from "./useQuantizedNow";
import { useProjectIconRevision } from "./useProjectIconRevision";
import { useRenamingShelfLocks } from "./useRenamingShelfLocks";
import { useDragClickSuppression } from "./useDragClickSuppression";
import { useListAutoAnimate, createListAnimationController } from "./useListAutoAnimate";
import {
  isActiveSortMode,
  sameOrder,
  PROJECT_UNIT_KEY_PREFIX,
  projectUnitKey,
  layoutActiveThreadsByProject,
  projectOrderUnits,
  expandProjectUnits,
  sortActiveThreads,
  visibleShelfThreads,
  type ActiveSortMode,
  type ReorderMode,
  type ProjectViewUnit,
} from "./inbox-layout";
import { ThreadCard, type ThreadReorderControls } from "./ThreadCard";
import { childThreadsByParent, collapsedChildThreads } from "./ChildThreadList";
import { useChildThreadDisplayValue } from "./ChildThreadDisplay";
import { useLifecycle } from "./useLifecycle";
import type { createDragPreview } from "./drag-preview";
import { usePinnedReorder } from "./usePinnedReorder";
import { useInboxReorder } from "./useInboxReorder";
import { useWorkingSince } from "./useWorkingSince";
import { useJumpHints } from "./JumpHints";
import { useSidebarSettings } from "./useSidebarSettings";
import {
  ALL_PROJECTS,
  filterByProject,
  reconcileProjectScope,
  searchThreadsByTitle,
  threadDisplayTitle,
  visibleInboxThreads,
} from "./inbox";
import {
  movePinnedIdByOffset,
  orderPinnedThreads,
  orderSubsetInPlace,
  rebaseMovedId,
  rebaseMovedUnit,
} from "./pinned-order";
import { DEFAULT_SNOOZE_PRESET_CONFIG, parseConfiguredSnoozePresets } from "./lifecycle";
import { DEFAULT_INACTIVE_AFTER_HOURS, parseInactiveAfterHours } from "./inactive";
import { projectIconUrl } from "./project-icons";
import { DEFAULT_SIDEBAR_SETTINGS } from "./sidebar-settings";
import { useScrollFade } from "./useScrollFade";
import { MAX_CHILD_EXPANSION, pruneChildExpansion, safeSetItem } from "./lib/safe-storage";
const ACTIVE_GROUPING_STORAGE_KEY = "bb-sidebar:active-grouping:v1";
const ACTIVE_SORT_STORAGE_KEY = "bb-sidebar:active-sort:v1";
const SHELF_EXPANSION_STORAGE_KEY = "bb-sidebar:shelf-expansion:v1";
const CHILD_EXPANSION_STORAGE_KEY = "bb-sidebar:child-expansion:v1";
const PROJECT_COLLAPSE_STORAGE_KEY = "bb-sidebar:project-collapse:v1";
const SETTLED_INITIAL_LIMIT = 10;

function readCollapsedProjects(): Set<string> {
  try {
    const stored = window.localStorage.getItem(PROJECT_COLLAPSE_STORAGE_KEY);
    if (!stored) return new Set();
    const parsed = JSON.parse(stored) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((value): value is string => typeof value === "string"));
  } catch {
    return new Set();
  }
}

function readChildExpansion(): Set<string> {
  try {
    const stored = window.localStorage.getItem(CHILD_EXPANSION_STORAGE_KEY);
    if (!stored) return new Set();
    const parsed = JSON.parse(stored) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    const filtered = parsed.filter((value): value is string => typeof value === "string");
    const trimmed = filtered.length > MAX_CHILD_EXPANSION ? filtered.slice(-MAX_CHILD_EXPANSION) : filtered;
    return new Set(trimmed);
  } catch {
    return new Set();
  }
}

const DEFAULT_SHELF_EXPANSION: ShelfExpansionState = {
  active: true,
  pinned: true,
  working: true,
  inactive: false,
  parked: false,
  snoozed: false,
  settled: false,
};

function readShelfExpansion(): ShelfExpansionState {
  try {
    const stored = window.localStorage.getItem(SHELF_EXPANSION_STORAGE_KEY);
    if (!stored) return DEFAULT_SHELF_EXPANSION;
    const parsed = JSON.parse(stored) as Partial<ShelfExpansionState>;
    return {
      // Keep Active expanded for people with the older stored shape.
      active: parsed.active !== false,
      // Pinned became independently collapsible after the first stored shape.
      pinned: parsed.pinned !== false,
      working: parsed.working !== false,
      inactive: parsed.inactive === true,
      parked: parsed.parked === true,
      snoozed: parsed.snoozed === true,
      settled: parsed.settled === true,
    };
  } catch {
    return DEFAULT_SHELF_EXPANSION;
  }
}

function readActiveSort(): ActiveSortMode {
  try {
    const stored = window.localStorage.getItem(ACTIVE_SORT_STORAGE_KEY);
    if (stored && isActiveSortMode(stored)) return stored;
    return window.localStorage.getItem(ACTIVE_GROUPING_STORAGE_KEY) === "true" ? "project" : "manual";
  } catch {
    return "manual";
  }
}

type ActiveShelfKind = "pinned" | "inbox";

/**
 * The sidebar's scrolling list. Manual order is durable, while optional views
 * can sort the same rows without changing their saved positions.
 *
 * The host owns the New-thread button and the search field above it, so this
 * ships neither. It filters by the `searchQuery` prop and keeps only the one
 * control the host has no equivalent for: the project scope picker.
 */
export function ThreadInbox({ activeThreadId, onNavigate, searchQuery }: PluginThreadListProps) {
  const { status, threads, projects } = useSidebarThreads();
  const workingSince = useWorkingSince(threads);
  const { providers } = useProviders();
  const actions = useSidebarThreadActions();
  const { values: legacySettings } = useSettings();
  const sidebarSettings = useSidebarSettings();
  const lifecycle = useLifecycle(threads);
  const projectIconRevision = useProjectIconRevision();
  const [listAnimationController] = useState(createListAnimationController);
  const attachShelvesAutoAnimateRef = useListAutoAnimate<HTMLDivElement>(listAnimationController);
  const attachDockAutoAnimateRef = useListAutoAnimate<HTMLDivElement>(listAnimationController);
  const attachScrollFadeRef = useScrollFade<HTMLDivElement>();
  const activeThreadIdRef = useRef(activeThreadId);
  activeThreadIdRef.current = activeThreadId;
  const jumpHintsRootRef = useRef<HTMLDivElement>(null);
  const jumpHints = useJumpHints(jumpHintsRootRef);
  const configuredSnoozePresets =
    sidebarSettings?.snoozePresets ??
    (typeof legacySettings?.snoozePresets === "string" ? legacySettings.snoozePresets : DEFAULT_SNOOZE_PRESET_CONFIG);
  const snoozePresets = useMemo(() => parseConfiguredSnoozePresets(configuredSnoozePresets), [configuredSnoozePresets]);
  const inactiveAfterHours = parseInactiveAfterHours(
    sidebarSettings?.inactiveThreadsEnabled ?? legacySettings?.inactiveThreadsEnabled === true,
    sidebarSettings
      ? String(sidebarSettings.inactiveAfterHours)
      : typeof legacySettings?.inactiveAfterHours === "string"
        ? legacySettings.inactiveAfterHours
        : String(DEFAULT_INACTIVE_AFTER_HOURS),
  );
  const dockShelvesEnabled = sidebarSettings?.dockShelves ?? DEFAULT_SIDEBAR_SETTINGS.dockShelves;
  const workingShelfEnabled = sidebarSettings?.workingShelf ?? DEFAULT_SIDEBAR_SETTINGS.workingShelf;
  const [scope, setScope] = useState<string>(ALL_PROJECTS);
  useEffect(() => {
    setScope((current) => reconcileProjectScope(current, projects));
  }, [projects]);
  const now = useQuantizedNow();
  const [expandedShelves, setExpandedShelves] = useState<ShelfExpansionState>(readShelfExpansion);
  const [expandedChildParentIds, setExpandedChildParentIds] = useState<Set<string>>(readChildExpansion);
  const [activeSortMode, setActiveSortMode] = useState<ActiveSortMode>(readActiveSort);
  const [collapsedProjectIds, setCollapsedProjectIds] = useState<Set<string>>(readCollapsedProjects);
  const [settledLimit, setSettledLimit] = useState(SETTLED_INITIAL_LIMIT);
  const [renamingShelfLocks, setRenamingShelfLocks] = useRenamingShelfLocks(threads, lifecycle);
  useEffect(() => {
    const pruned = pruneChildExpansion([...expandedChildParentIds]);
    safeSetItem(CHILD_EXPANSION_STORAGE_KEY, JSON.stringify(pruned));
  }, [expandedChildParentIds]);
  useEffect(() => {
    safeSetItem(SHELF_EXPANSION_STORAGE_KEY, JSON.stringify(expandedShelves));
  }, [expandedShelves]);
  useEffect(() => {
    safeSetItem(ACTIVE_SORT_STORAGE_KEY, activeSortMode);
  }, [activeSortMode]);

  const projectNameById = useMemo(() => new Map(projects.map((project) => [project.id, project.name])), [projects]);
  useEffect(() => {
    // Forget removed projects, but not before the project list has loaded.
    const ids = [...collapsedProjectIds].filter((id) => projectNameById.size === 0 || projectNameById.has(id));
    safeSetItem(PROJECT_COLLAPSE_STORAGE_KEY, JSON.stringify(ids));
  }, [collapsedProjectIds, projectNameById]);
  const providerById = useMemo(() => new Map(providers.map((provider) => [provider.id, provider])), [providers]);
  const childDisplay = useChildThreadDisplayValue(sidebarSettings, providerById);
  const childrenByParentId = useMemo(
    () => childThreadsByParent(threads, childDisplay.sort),
    [threads, childDisplay.sort],
  );
  useEffect(() => {
    setExpandedChildParentIds((current) => {
      const next = new Set([...current].filter((threadId) => childrenByParentId.has(threadId)));
      return next.size === current.size ? current : next;
    });
  }, [childrenByParentId]);
  const toggleChildExpansion = useCallback((parentThreadId: string) => {
    setExpandedChildParentIds((current) => {
      const next = new Set(current);
      if (next.has(parentThreadId)) next.delete(parentThreadId);
      else next.add(parentThreadId);
      return next;
    });
  }, []);

  const {
    activeListThreadId,
    pinnedBase,
    inboxBase,
    workingBase,
    inactiveBase,
    allPinnedBase,
    allInboxBase,
    parked,
    snoozed,
    settled,
  } = useInboxShelfThreads({
    activeThreadId,
    childrenByParentId,
    inactiveAfterHours,
    lifecycle,
    now,
    renamingShelfLocks,
    scope,
    threads,
    workingShelfEnabled,
  });

  const pinnedReorder = usePinnedReorder(allPinnedBase);
  const inboxReorder = useInboxReorder(allInboxBase);
  // A "unit" drag moves whole project-view units, so its ids are unit keys
  // rather than thread ids.
  const [dragOrder, setDragOrder] = useState<InboxDragOrder | null>(null);
  const dragOrderRef = useRef(dragOrder);
  dragOrderRef.current = dragOrder;
  const dragPreviewRef = useRef<ReturnType<typeof createDragPreview> | null>(null);
  useLayoutEffect(() => {
    dragPreviewRef.current?.play();
  });
  const activeReorderCancelRef = useRef<(() => void) | null>(null);
  const suppressDragClick = useDragClickSuppression(activeReorderCancelRef);
  // A thread can be deleted from anywhere while it is being dragged. Unmounting
  // the whole sidebar already cancels; losing just this row has to as well, or
  // the drag keeps steering an order around an id that is gone. This catches
  // the thread leaving the host's list, not every way a row can stop being a
  // valid drag source — archiving or parking it still leaves the gesture
  // running until the drop rebases it.
  useEffect(() => {
    if (!dragOrder) return;
    // A dragged project lives as long as any of its threads does.
    const survives = dragOrder.movingId.startsWith(PROJECT_UNIT_KEY_PREFIX)
      ? threads.some((candidate) => projectUnitKey(candidate.projectId) === dragOrder.movingId)
      : threads.some((candidate) => candidate.id === dragOrder.movingId);
    if (!survives) activeReorderCancelRef.current?.();
  }, [dragOrder, threads]);
  const pinned = useMemo(() => {
    const ordered = orderPinnedThreads(pinnedBase, pinnedReorder.ids);
    return orderPinnedThreads(ordered, dragOrder?.shelf === "pinned" ? dragOrder.ids : null);
  }, [dragOrder, pinnedBase, pinnedReorder.ids]);
  const orderedInbox = useMemo(() => orderPinnedThreads(inboxBase, inboxReorder.ids), [inboxBase, inboxReorder.ids]);
  // The project view as stored, without any drag preview. A unit drag and its
  // drop are both resolved against this.
  const storedProjectUnits = useMemo(() => layoutActiveThreadsByProject(orderedInbox), [orderedInbox]);
  const inbox = useMemo(() => {
    if (dragOrder?.shelf !== "inbox") return orderedInbox;
    return orderSubsetInPlace(
      orderedInbox,
      dragOrder.mode === "unit" ? expandProjectUnits(dragOrder.ids, storedProjectUnits) : dragOrder.ids,
    );
  }, [dragOrder, orderedInbox, storedProjectUnits]);
  // Working and Inactive keep Active's manual order, so a thread that leaves
  // for either comes back to the slot it left.
  const working = useMemo(() => orderPinnedThreads(workingBase, inboxReorder.ids), [workingBase, inboxReorder.ids]);
  const inactive = useMemo(() => orderPinnedThreads(inactiveBase, inboxReorder.ids), [inactiveBase, inboxReorder.ids]);
  // Keep the root of an attention path reachable when its shelf is folded.
  const attentionParentIds = useMemo(() => {
    const ids = new Set<string>();
    if (
      !(sidebarSettings?.showRunningChildrenWhenCollapsed ?? DEFAULT_SIDEBAR_SETTINGS.showRunningChildrenWhenCollapsed)
    ) {
      return ids;
    }
    for (const thread of [...pinnedBase, ...inboxBase, ...inactiveBase]) {
      if (collapsedChildThreads(childrenByParentId.get(thread.id) ?? [], childrenByParentId, null, true).length > 0) {
        ids.add(thread.id);
      }
    }
    return ids;
  }, [childrenByParentId, inactiveBase, inboxBase, pinnedBase, sidebarSettings?.showRunningChildrenWhenCollapsed]);
  const visiblePinned = useMemo(
    () => visibleShelfThreads(pinned, expandedShelves.pinned, activeListThreadId, undefined, attentionParentIds),
    [attentionParentIds, activeListThreadId, expandedShelves.pinned, pinned],
  );
  const visibleInbox = useMemo(
    () => visibleShelfThreads(inbox, expandedShelves.active, activeListThreadId, undefined, attentionParentIds),
    [attentionParentIds, activeListThreadId, expandedShelves.active, inbox],
  );
  const visibleWorking = useMemo(
    () => visibleShelfThreads(working, expandedShelves.working, activeListThreadId),
    [activeListThreadId, expandedShelves.working, working],
  );
  const visibleInactive = useMemo(
    () => visibleShelfThreads(inactive, expandedShelves.inactive, activeListThreadId, undefined, attentionParentIds),
    [attentionParentIds, activeListThreadId, expandedShelves.inactive, inactive],
  );
  const sortedVisibleInbox = useMemo(
    () => sortActiveThreads(visibleInbox, activeSortMode),
    [activeSortMode, visibleInbox],
  );
  // Laid out from every Active thread, not just the visible ones, so
  // collapsing the shelf never turns a group back into loose cards.
  const inboxProjectUnits = useMemo(() => layoutActiveThreadsByProject(inbox), [inbox]);
  const inboxProjectView = useMemo((): ProjectViewUnit[] => {
    // A collapsed Active shelf hides its project headers too, leaving active
    // and attention paths visible, like the other active shelves.
    if (!expandedShelves.active) {
      return visibleInbox.map((thread) => ({
        kind: "thread",
        key: thread.id,
        thread,
      }));
    }
    return inboxProjectUnits.map((unit) => {
      if (unit.kind === "thread") return unit;
      const expanded = !collapsedProjectIds.has(unit.projectId);
      return {
        ...unit,
        expanded,
        threadCount: unit.threads.length,
        // A collapsed project keeps active and attention paths, like a shelf.
        threads: visibleShelfThreads(unit.threads, expanded, activeListThreadId, undefined, attentionParentIds),
      };
    });
  }, [
    attentionParentIds,
    activeListThreadId,
    collapsedProjectIds,
    expandedShelves.active,
    inboxProjectUnits,
    visibleInbox,
  ]);
  const toggleProjectCollapse = (projectId: string) =>
    setCollapsedProjectIds((current) => {
      const next = new Set(current);
      if (!next.delete(projectId)) next.add(projectId);
      return next;
    });
  // Leaving a thread follows Pinned, then Active, including collapsed rows.
  const nextThreadCandidates = useMemo(
    () => [
      ...pinned,
      ...(activeSortMode === "project"
        ? inboxProjectUnits.flatMap((unit) => (unit.kind === "thread" ? [unit.thread] : unit.threads))
        : sortActiveThreads(inbox, activeSortMode)),
      ...working,
    ],
    [activeSortMode, inbox, inboxProjectUnits, pinned, working],
  );
  const nextThreadCandidatesRef = useRef(nextThreadCandidates);
  nextThreadCandidatesRef.current = nextThreadCandidates;

  // A drag installs its listeners once, at pointer-down, but the shelf keeps
  // moving underneath it: the host pushes order changes mid-gesture. The order
  // and the membership a drop depends on are therefore read through these refs
  // rather than captured, or the write reverts whatever landed while the
  // pointer was down. The row and shelf a gesture belongs to stay captured —
  // those are what the gesture is about.
  const reorderTargetsRef = useRef({
    pinned: pinnedReorder,
    inbox: inboxReorder,
  });
  reorderTargetsRef.current = { pinned: pinnedReorder, inbox: inboxReorder };
  const storedProjectUnitsRef = useRef(storedProjectUnits);
  storedProjectUnitsRef.current = storedProjectUnits;
  const activeSortModeRef = useRef(activeSortMode);
  activeSortModeRef.current = activeSortMode;
  /**
   * What a row or header reorders among. In the project view a thread inside
   * a group moves within its project; a lone thread or a group header moves
   * among the top-level units.
   */
  const reorderScope = useCallback(
    (
      key: string,
      shelf: "pinned" | "inbox",
    ): {
      mode: ReorderMode;
      ids: string[];
    } => {
      if (shelf === "inbox" && activeSortMode === "project") {
        const visibleThreadIds = new Set(visibleInbox.map((thread) => thread.id));
        // Folding Active hides headers, not the projects' reorder boundaries.
        const units = expandedShelves.active
          ? inboxProjectView
          : storedProjectUnits.filter((unit) =>
              unit.kind === "thread"
                ? visibleThreadIds.has(unit.thread.id)
                : unit.threads.some((thread) => visibleThreadIds.has(thread.id)),
            );
        const group = units.find((unit) => unit.kind === "group" && unit.threads.some((thread) => thread.id === key));
        return group?.kind === "group"
          ? {
              mode: "thread",
              ids: group.threads.filter((thread) => visibleThreadIds.has(thread.id)).map((thread) => thread.id),
            }
          : { mode: "unit", ids: units.map((unit) => unit.key) };
      }
      return {
        mode: "thread",
        ids: (shelf === "pinned" ? visiblePinned : visibleInbox).map((candidate) => candidate.id),
      };
    },
    [activeSortMode, expandedShelves.active, inboxProjectView, storedProjectUnits, visibleInbox, visiblePinned],
  );
  const reorderScopeRef = useRef(reorderScope);
  reorderScopeRef.current = reorderScope;
  const commitReorder = (
    shelf: "pinned" | "inbox",
    mode: ReorderMode,
    previewIds: readonly string[],
    movingId: string,
  ) => {
    if (shelf === "pinned") {
      const live = reorderTargetsRef.current.pinned;
      void live.reorder(rebaseMovedId(live.ids, previewIds, movingId), movingId);
      return;
    }
    const live = reorderTargetsRef.current.inbox;
    const participating = new Set(previewIds);
    if (mode === "unit") {
      const liveUnits = projectOrderUnits(storedProjectUnitsRef.current).filter((unit) => participating.has(unit.key));
      if (!liveUnits.some((unit) => unit.key === movingId)) return;
      void live.reorder(rebaseMovedUnit(live.ids, liveUnits, previewIds, movingId));
      return;
    }
    // Within a project, its threads trade places among the slots they hold,
    // so the project itself stays where it is in the list.
    const projectUnit =
      activeSortModeRef.current === "project"
        ? storedProjectUnitsRef.current.find((unit) =>
            unit.kind === "thread"
              ? unit.thread.id === movingId
              : unit.threads.some((thread) => thread.id === movingId),
          )
        : undefined;
    void live.reorder(
      activeSortModeRef.current === "project"
        ? rebaseMovedUnit(
            live.ids,
            (projectUnit?.kind === "group" ? projectUnit.threads : projectUnit ? [projectUnit.thread] : [])
              .filter((thread) => participating.has(thread.id))
              .map((thread) => ({ key: thread.id, ids: [thread.id] })),
            previewIds,
            movingId,
          )
        : rebaseMovedId(live.ids, previewIds, movingId),
    );
  };
  // Keyboard reordering moves a row with no pointer to follow and no sound, so
  // the only feedback a screen reader gets is what this region says.
  const [reorderAnnouncement, setReorderAnnouncement] = useState("");

  const threadReorderControls = (thread: PluginSidebarThread, shelf: "pinned" | "inbox"): ThreadReorderControls =>
    reorderControls(thread.id, shelf, threadDisplayTitle(thread));

  /**
   * Pointer and keyboard reordering for one row or project header. `key` is a
   * thread id, or a project unit key for a header.
   */
  const reorderControls = (key: string, shelf: "pinned" | "inbox", title: string): ThreadReorderControls => {
    const target = shelf === "pinned" ? pinnedReorder : inboxReorder;
    return {
      disabled: target.isReordering,
      isDragging: dragOrder?.shelf === shelf && dragOrder.movingId === key,
      onPointerDown: createDragReorderHandler({
        key,
        shelf,
        target,
        activeReorderCancelRef,
        dragOrderRef,
        dragPreviewRef,
        listAnimationController,
        suppressDragClick,
        reorderScopeRef,
        storedProjectUnitsRef,
        setDragOrder,
        commitReorder,
      }),
      onKeyDown: (event) => {
        if (!event.altKey || target.isReordering || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        const { mode, ids: currentIds } = reorderScopeRef.current(key, shelf);
        const ids = movePinnedIdByOffset(currentIds, key, event.key === "ArrowUp" ? -1 : 1);
        const shelfName = shelf === "pinned" ? "Pinned" : "Active";
        setReorderAnnouncement(
          sameOrder(ids, currentIds)
            ? `${title} is already ${event.key === "ArrowUp" ? "first" : "last"} in ${shelfName}`
            : `${title} moved to ${ids.indexOf(key) + 1} of ${ids.length} in ${shelfName}`,
        );
        commitReorder(shelf, mode, ids, key);
      },
    };
  };

  const isSearching = searchQuery.trim().length > 0;
  const searchCandidates = useMemo(
    () => filterByProject(visibleInboxThreads(threads), scope === ALL_PROJECTS ? null : scope),
    [scope, threads],
  );
  const searchResults = useMemo(
    () => searchThreadsByTitle(searchCandidates, searchQuery),
    [searchCandidates, searchQuery],
  );
  const visibleParked = useMemo(
    () => visibleShelfThreads(parked, expandedShelves.parked, activeListThreadId),
    [activeListThreadId, expandedShelves.parked, parked],
  );
  const visibleSnoozed = useMemo(
    () => visibleShelfThreads(snoozed, expandedShelves.snoozed, activeListThreadId),
    [activeListThreadId, expandedShelves.snoozed, snoozed],
  );
  const visibleSettled = useMemo(
    () => visibleShelfThreads(settled, expandedShelves.settled, activeListThreadId, settledLimit),
    [activeListThreadId, expandedShelves.settled, settled, settledLimit],
  );
  const wokeThreadIds = useMemo(
    () =>
      new Set(
        [...pinned, ...inbox, ...working, ...inactive]
          .filter((thread) => lifecycle.wokeFor(thread))
          .map((thread) => thread.id),
      ),
    [inactive, inbox, lifecycle, pinned, working],
  );

  const parkActiveThread = async (thread: PluginSidebarThread, mutation: () => Promise<boolean>) => {
    const parked = await mutation();
    if (!parked || activeThreadIdRef.current !== thread.id) return;

    // Read the latest list after the request, since another client may
    // have moved or reordered the first candidate while it was pending.
    const nextThread = nextThreadCandidatesRef.current.find((candidate) => candidate.id !== thread.id);
    if (nextThread) {
      actions.open(nextThread.id);
    } else {
      actions.openNewThread({
        projectId: thread.projectId,
        focusPrompt: true,
      });
    }
    onNavigate();
  };

  const parkThread = (thread: PluginSidebarThread) => void parkActiveThread(thread, () => lifecycle.park(thread.id));
  const settleThread = (thread: PluginSidebarThread) =>
    void parkActiveThread(thread, () => lifecycle.settle(thread.id));
  const snoozeThread = (thread: PluginSidebarThread, until: number) =>
    void parkActiveThread(thread, () => lifecycle.snooze(thread.id, until));

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

  return (
    <ThreadInboxView
      listAnimationController={listAnimationController}
      sidebarSettings={sidebarSettings}
      projects={projects}
      workingSince={workingSince}
      childDisplay={childDisplay}
      jumpHints={jumpHints}
      jumpHintsRootRef={jumpHintsRootRef}
      scope={scope}
      projectIconRevision={projectIconRevision}
      setScope={setScope}
      reorderAnnouncement={reorderAnnouncement}
      attachScrollFadeRef={attachScrollFadeRef}
      status={status}
      isSearching={isSearching}
      searchResults={searchResults}
      projectNameById={projectNameById}
      activeThreadId={activeThreadId}
      now={now}
      wokeThreadIds={wokeThreadIds}
      lifecycle={lifecycle}
      onNavigate={onNavigate}
      dockShelvesEnabled={dockShelvesEnabled}
      attachShelvesAutoAnimateRef={attachShelvesAutoAnimateRef}
      attachDockAutoAnimateRef={attachDockAutoAnimateRef}
      pinned={pinned}
      expandedShelves={expandedShelves}
      setExpandedShelves={setExpandedShelves}
      visiblePinned={visiblePinned}
      renderActiveThread={renderActiveThread}
      inbox={inbox}
      activeSortMode={activeSortMode}
      setActiveSortMode={setActiveSortMode}
      inboxProjectView={inboxProjectView}
      toggleProjectCollapse={toggleProjectCollapse}
      reorderControls={reorderControls}
      visibleInbox={visibleInbox}
      sortedVisibleInbox={sortedVisibleInbox}
      working={working}
      inactive={inactive}
      visibleWorking={visibleWorking}
      visibleInactive={visibleInactive}
      parkThread={parkThread}
      settleThread={settleThread}
      snoozeThread={snoozeThread}
      snoozed={snoozed}
      snoozePresets={snoozePresets}
      visibleSnoozed={visibleSnoozed}
      parked={parked}
      visibleParked={visibleParked}
      settled={settled}
      visibleSettled={visibleSettled}
      settledLimit={settledLimit}
      setSettledLimit={setSettledLimit}
    />
  );
}
