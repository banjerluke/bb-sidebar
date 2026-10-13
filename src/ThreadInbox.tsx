import { useSidebarThreads, useProviders } from "./bb-sdk";
import { STORAGE_KEYS } from "./lib/storage-keys";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useBbNavigate, type PluginSidebarThread, type PluginThreadListProps } from "@get-bb/plugin-sdk/app";
import { useInboxShelfThreads } from "./useInboxShelfThreads";
import { createDragReorderHandler } from "./drag-reorder";
import type { InboxDragOrder } from "./drag-reorder-geometry";
import { ThreadInboxView } from "./ThreadInboxView";
import { useQuantizedNow } from "./useQuantizedNow";
import { useProjectIconRevision } from "./useProjectIconRevision";
import { useRenamingShelfLocks } from "./useRenamingShelfLocks";
import { useDragClickSuppression } from "./useDragClickSuppression";
import { useListAutoAnimate, createListAnimationController } from "./useListAutoAnimate";
import {
  sameOrder,
  PROJECT_UNIT_KEY_PREFIX,
  projectUnitKey,
  layoutActiveThreadsByProject,
  projectOrderUnits,
  expandProjectUnits,
  sortActiveThreads,
  visibleShelfThreads,
  type ReorderMode,
  type ProjectViewUnit,
} from "./inbox-layout";
import type { ThreadReorderControls } from "./ThreadCard";
import { InboxProvider, useInboxContextValues } from "./InboxContext";
import { createInboxThreadRenderer } from "./InboxThreadRenderer";
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
import { parseConfiguredSnoozePresets } from "./lifecycle";
import { parseInactiveAfterHours } from "./inactive";
import { DEFAULT_SIDEBAR_SETTINGS } from "./sidebar-settings";
import { useScrollFade } from "./useScrollFade";
import { usePersistedPreference } from "./lib/use-persisted-preference";
import {
  activeSortCodec,
  childExpansionCodec,
  projectCollapseCodec,
  shelfExpansionCodec,
} from "./lib/inbox-preference-codecs";
const SETTLED_INITIAL_LIMIT = 10;

type ActiveShelfKind = "pinned" | "inbox";

/**
 * The sidebar's scrolling list. Manual order is durable; optional views sort
 * the same rows without changing their saved positions.
 *
 * The host owns New thread and search. This list applies searchQuery and adds
 * the plugin's project scope picker.
 */
export function ThreadInbox({ activeThreadId, onNavigate, searchQuery }: PluginThreadListProps) {
  const { status, threads, projects } = useSidebarThreads();
  const workingSince = useWorkingSince(threads);
  const { providers } = useProviders();
  const navigate = useBbNavigate();
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
  const configuredSnoozePresets = sidebarSettings?.snoozePresets ?? DEFAULT_SIDEBAR_SETTINGS.snoozePresets;
  const snoozePresets = useMemo(() => parseConfiguredSnoozePresets(configuredSnoozePresets), [configuredSnoozePresets]);
  const inactiveAfterHours = parseInactiveAfterHours(
    // Keep the loading view active until saved or cached settings are available.
    sidebarSettings?.inactiveThreadsEnabled ?? false,
    String(sidebarSettings?.inactiveAfterHours ?? DEFAULT_SIDEBAR_SETTINGS.inactiveAfterHours),
  );
  const dockShelvesEnabled = sidebarSettings?.dockShelves ?? DEFAULT_SIDEBAR_SETTINGS.dockShelves;
  const workingShelfEnabled = sidebarSettings?.workingShelf ?? DEFAULT_SIDEBAR_SETTINGS.workingShelf;
  const [scope, setScope] = useState<string>(ALL_PROJECTS);
  useEffect(() => {
    setScope((current) => reconcileProjectScope(current, projects));
  }, [projects]);
  const now = useQuantizedNow();
  const projectNameById = useMemo(() => new Map(projects.map((project) => [project.id, project.name])), [projects]);
  const collapseCodec = useMemo(
    () => ({
      ...projectCollapseCodec,
      // Forget removed projects only after the project list has loaded.
      prune: (ids: Set<string>) =>
        new Set([...ids].filter((id) => projectNameById.size === 0 || projectNameById.has(id))),
    }),
    [projectNameById],
  );
  const [expandedChildParentIds, setExpandedChildParentIds] = usePersistedPreference(
    STORAGE_KEYS.childExpansion.key,
    childExpansionCodec,
  );
  const [expandedShelves, setExpandedShelves] = usePersistedPreference(
    STORAGE_KEYS.shelfExpansion.key,
    shelfExpansionCodec,
  );
  const [activeSortMode, setActiveSortMode] = usePersistedPreference(STORAGE_KEYS.activeSort.key, activeSortCodec);
  const [collapsedProjectIds, setCollapsedProjectIds] = usePersistedPreference(
    STORAGE_KEYS.projectCollapse.key,
    collapseCodec,
  );
  const [settledLimit, setSettledLimit] = useState(SETTLED_INITIAL_LIMIT);
  const [renamingShelfLocks, setRenamingShelfLocks] = useRenamingShelfLocks(threads, lifecycle);
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
  const toggleProjectCollapse = useCallback(
    (projectId: string) =>
      setCollapsedProjectIds((current) => {
        const next = new Set(current);
        if (!next.delete(projectId)) next.add(projectId);
        return next;
      }),
    [],
  );
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

  const parkActiveThread = useCallback(
    async (thread: PluginSidebarThread, mutation: () => Promise<boolean>) => {
      const parked = await mutation();
      if (!parked || activeThreadIdRef.current !== thread.id) return;

      // Read the latest list after the request, since another client may
      // have moved or reordered the first candidate while it was pending.
      const nextThread = nextThreadCandidatesRef.current.find((candidate) => candidate.id !== thread.id);
      if (nextThread) {
        navigate.toThread(nextThread.id);
      } else {
        navigate.toCompose({
          projectId: thread.projectId,
          focusPrompt: true,
        });
      }
      onNavigate();
    },
    [navigate, onNavigate],
  );

  const parkThread = useCallback(
    (thread: PluginSidebarThread) => void parkActiveThread(thread, () => lifecycle.park(thread.id)),
    [parkActiveThread, lifecycle],
  );
  const settleThread = useCallback(
    (thread: PluginSidebarThread) => void parkActiveThread(thread, () => lifecycle.settle(thread.id)),
    [parkActiveThread, lifecycle],
  );
  const snoozeThread = useCallback(
    (thread: PluginSidebarThread, until: number) =>
      void parkActiveThread(thread, () => lifecycle.snooze(thread.id, until)),
    [parkActiveThread, lifecycle],
  );

  const inboxContext = useInboxContextValues({
    providerById,
    projectNameById,
    projectIconRevision,
    projects,
    sidebarSettings,
    snoozePresets,
    lifecycle,
    childrenByParentId,
    activeThreadId,
    now,
    navigate,
    onNavigate,
    parkThread,
    settleThread,
    snoozeThread,
    toggleChildExpansion,
    setRenamingShelfLocks,
    setScope,
    setExpandedShelves,
    setActiveSortMode,
    setSettledLimit,
    toggleProjectCollapse,
  });
  const renderActiveThread = createInboxThreadRenderer(inboxContext, {
    wokeThreadIds,
    expandedChildParentIds,
    threadReorderControls,
    activeSortMode,
  });

  return (
    <InboxProvider
      value={inboxContext}
      listAnimationController={listAnimationController}
      workingSince={workingSince}
      childDisplay={childDisplay}
      jumpHints={jumpHints}
    >
      <ThreadInboxView
        shelves={{
          pinned: { threads: pinned, visibleThreads: visiblePinned },
          inbox: { threads: inbox, visibleThreads: visibleInbox },
          working: { threads: working, visibleThreads: visibleWorking },
          inactive: { threads: inactive, visibleThreads: visibleInactive },
          snoozed: { threads: snoozed, visibleThreads: visibleSnoozed },
          parked: { threads: parked, visibleThreads: visibleParked },
          settled: { threads: settled, visibleThreads: visibleSettled },
        }}
        jumpHintsRootRef={jumpHintsRootRef}
        scope={scope}
        reorderAnnouncement={reorderAnnouncement}
        attachScrollFadeRef={attachScrollFadeRef}
        status={status}
        isSearching={isSearching}
        searchResults={searchResults}
        wokeThreadIds={wokeThreadIds}
        dockShelvesEnabled={dockShelvesEnabled}
        attachShelvesAutoAnimateRef={attachShelvesAutoAnimateRef}
        attachDockAutoAnimateRef={attachDockAutoAnimateRef}
        expandedShelves={expandedShelves}
        renderActiveThread={renderActiveThread}
        activeSortMode={activeSortMode}
        inboxProjectView={inboxProjectView}
        reorderControls={reorderControls}
        sortedVisibleInbox={sortedVisibleInbox}
        settledLimit={settledLimit}
      />
    </InboxProvider>
  );
}
