import { useSidebarThreads, useProviders } from "./bb-sdk";
import { STORAGE_KEYS } from "./lib/storage-keys";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useBbNavigate, type PluginSidebarThread, type PluginThreadListProps } from "@get-bb/plugin-sdk/app";
import { useInboxShelfThreads } from "./useInboxShelfThreads";
import { createDragReorderHandler } from "./drag-reorder";
import type { DragShelf, InboxDragOrder, SectionDrop } from "./drag-reorder-geometry";
import { ThreadInboxView } from "./ThreadInboxView";
import { useQuantizedNow } from "./useQuantizedNow";
import { useProjectIconRevision } from "./useProjectIconRevision";
import { useRenamingShelfLocks } from "./useRenamingShelfLocks";
import { useDragClickSuppression } from "./useDragClickSuppression";
import { useListAutoAnimate, createListAnimationController } from "./useListAutoAnimate";
import {
  sameOrder,
  sortActiveThreads,
  visibleShelfThreads,
  type ReorderMode,
  type ReorderScope,
  projectUnitKey,
} from "./inbox-layout";
import type { ThreadReorderControls } from "./ThreadCard";
import { InboxProvider, useInboxContextValues } from "./InboxContext";
import { createInboxThreadRenderer } from "./InboxThreadRenderer";
import { childThreadsByParent, collapsedChildThreads } from "./ChildThreadList";
import { useChildThreadDisplayValue } from "./ChildThreadDisplay";
import { useLifecycle } from "./useLifecycle";
import type { createDragPreview } from "./drag-preview";
import { usePinnedReorder } from "./usePinnedReorder";
import { useCollapseChildrenOnSettle } from "./useCollapseChildrenOnSettle";
import { useInboxReorder } from "./useInboxReorder";
import { useInboxProjectGroups } from "./useInboxProjectGroups";
import { useInboxSections } from "./useInboxSections";
import { sectionIdFromKey } from "./section-groups";
import { useLeaveActiveThread } from "./useLeaveActiveThread";
import { environmentUnitKey } from "./environment-groups";
import { useWorkingSince } from "./useWorkingSince";
import { useJumpHints } from "./JumpHints";
import { useSidebarSettings } from "./useSidebarSettings";
import { useProjectScope } from "./useProjectScope";
import { filterByProjects, searchThreadsByTitle, threadDisplayTitle, visibleInboxThreads } from "./inbox";
import { movePinnedIdByOffset, orderPinnedThreads, rebaseMovedId } from "./pinned-order";
import { parseConfiguredSnoozePresets } from "./lifecycle";
import { parseInactiveAfterHours } from "./inactive";
import { DEFAULT_SIDEBAR_SETTINGS } from "./sidebar-settings";
import { useScrollFade } from "./useScrollFade";
import { usePersistedPreference } from "./lib/use-persisted-preference";
import { activeViewCodec, childExpansionCodec, shelfExpansionCodec } from "./lib/inbox-preference-codecs";
const SETTLED_INITIAL_LIMIT = 10;

type ActiveShelfKind = "pinned" | "inbox";

/**
 * The sidebar's scrolling list. Manual order is durable; optional views sort
 * the same rows without changing their saved positions.
 *
 * The host owns New thread and search. This list applies searchQuery and adds
 * the plugin's project scope picker.
 */
export function ThreadInbox({ activeThreadId, onNavigate, searchQuery, isCompactViewport }: PluginThreadListProps) {
  const { status, threads, projects, sections } = useSidebarThreads();
  const workingSince = useWorkingSince(threads);
  const { providers } = useProviders();
  const navigate = useBbNavigate();
  const sidebarSettings = useSidebarSettings();
  const lifecycle = useLifecycle(threads);
  const projectIconRevision = useProjectIconRevision();
  const listAnimationController = useMemo(() => createListAnimationController(!isCompactViewport), [isCompactViewport]);
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
  const [scope, setScope] = useProjectScope({ projects, status });
  const now = useQuantizedNow();
  const projectNameById = useMemo(() => new Map(projects.map((project) => [project.id, project.name])), [projects]);
  const [expandedChildParentIds, setExpandedChildParentIds] = usePersistedPreference(
    STORAGE_KEYS.childExpansion.key,
    childExpansionCodec,
  );
  const [expandedShelves, setExpandedShelves] = usePersistedPreference(
    STORAGE_KEYS.shelfExpansion.key,
    shelfExpansionCodec,
  );
  const [activeView, setActiveView] = usePersistedPreference(STORAGE_KEYS.activeView.key, activeViewCodec);
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
  useCollapseChildrenOnSettle(settled, lifecycle, setExpandedChildParentIds);

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
    if (dragOrder.shelf === "sections") {
      if (!sections.some((section) => section.id === sectionIdFromKey(dragOrder.movingId))) {
        activeReorderCancelRef.current?.();
      }
      return;
    }
    const survives = threads.some(
      (thread) =>
        thread.id === dragOrder.movingId ||
        projectUnitKey(thread.projectId) === dragOrder.movingId ||
        (thread.environment?.id && environmentUnitKey(thread.projectId, thread.environment.id) === dragOrder.movingId),
    );
    if (!survives) activeReorderCancelRef.current?.();
  }, [dragOrder, sections, threads]);
  const pinned = useMemo(() => {
    const ordered = orderPinnedThreads(pinnedBase, pinnedReorder.ids);
    return orderPinnedThreads(ordered, dragOrder?.shelf === "pinned" ? dragOrder.ids : null);
  }, [dragOrder, pinnedBase, pinnedReorder.ids]);
  // A sorted order replaces manual order before grouping, so projects follow their newest row.
  const orderedInbox = useMemo(
    () => sortActiveThreads(orderPinnedThreads(inboxBase, inboxReorder.ids), activeView.order),
    [inboxBase, inboxReorder.ids, activeView.order],
  );
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
  const projectGroups = useInboxProjectGroups({
    orderedInbox,
    dragOrder,
    expanded: expandedShelves.active,
    activeThreadId: activeListThreadId,
    attentionIds: attentionParentIds,
    projectNameById,
  });
  const {
    inbox,
    visibleInbox,
    units: inboxProjectUnits,
    view: inboxProjectView,
    toggleProjectCollapse,
  } = projectGroups;
  const projectGroupsRef = useRef(projectGroups);
  projectGroupsRef.current = projectGroups;
  const visibleWorking = useMemo(
    () => visibleShelfThreads(working, expandedShelves.working, activeListThreadId),
    [activeListThreadId, expandedShelves.working, working],
  );
  const visibleInactive = useMemo(
    () => visibleShelfThreads(inactive, expandedShelves.inactive, activeListThreadId, undefined, attentionParentIds),
    [attentionParentIds, activeListThreadId, expandedShelves.inactive, inactive],
  );
  const sectionGroups = useInboxSections({
    inbox,
    sections,
    dragOrder,
    manual: activeView.order === "manual",
    activeThreadId: activeListThreadId,
    attentionIds: attentionParentIds,
    elsewhere: { pinned, working, inactive, snoozed, parked, settled },
    threads,
    scope,
  });
  const sectionGroupsRef = useRef(sectionGroups);
  sectionGroupsRef.current = sectionGroups;
  const sectionsShown = activeView.group === "section" && expandedShelves.active;
  const sectionDropRef = useRef<SectionDrop | null>(null);
  sectionDropRef.current = sectionsShown ? sectionGroups.sectionDrop : null;
  // Leaving a thread follows Pinned, then Active, including collapsed rows.
  const nextThreadCandidates = useMemo(
    () => [
      ...pinned,
      ...(activeView.group === "project"
        ? inboxProjectUnits.flatMap((unit) => (unit.kind === "thread" ? [unit.thread] : unit.threads))
        : activeView.group === "section"
          ? sectionGroups.orderedThreads
          : inbox),
      ...working,
    ],
    [activeView.group, inbox, inboxProjectUnits, pinned, working, sectionGroups.orderedThreads],
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
  const storedOrderUnits = sectionsShown ? sectionGroups.orderUnits : projectGroups.orderUnits;
  const storedOrderUnitsRef = useRef(storedOrderUnits);
  storedOrderUnitsRef.current = storedOrderUnits;
  const activeViewRef = useRef(activeView);
  activeViewRef.current = activeView;
  /**
   * What a row or header reorders among. In the project view a thread inside
   * a group moves within its project; a lone thread or a group header moves
   * among the top-level units.
   */
  const reorderScope = useCallback(
    (key: string, shelf: DragShelf): ReorderScope => {
      if (shelf === "sections" || (shelf === "inbox" && sectionsShown)) return sectionGroups.reorderScope(key);
      // Sorted rows have no manual slot; a drag can at most file them.
      if (shelf === "inbox" && activeView.order !== "manual") return { mode: "thread", ids: [key] };
      if (shelf === "inbox" && activeView.group === "section") return sectionGroups.scopeAmong(key, visibleInbox);
      if (shelf === "inbox" && activeView.group === "project") {
        return projectGroups.reorderScope(key);
      }
      return {
        mode: "thread",
        ids: (shelf === "pinned" ? visiblePinned : visibleInbox).map((candidate) => candidate.id),
      };
    },
    [activeView.group, activeView.order, projectGroups, sectionGroups, sectionsShown, visibleInbox, visiblePinned],
  );
  const reorderScopeRef = useRef(reorderScope);
  reorderScopeRef.current = reorderScope;
  const commitReorder = (
    shelf: DragShelf,
    mode: ReorderMode,
    previewIds: readonly string[],
    movingId: string,
    parentKey: string | null = null,
  ) => {
    if (shelf === "sections") {
      sectionGroupsRef.current.commitSectionOrder(previewIds, movingId);
      return;
    }
    if (shelf === "pinned") {
      const live = reorderTargetsRef.current.pinned;
      void live.reorder(rebaseMovedId(live.ids, previewIds, movingId), movingId);
      return;
    }
    const live = reorderTargetsRef.current.inbox;
    const ids =
      activeViewRef.current.group === "project" || mode === "unit"
        ? projectGroupsRef.current.rebaseOrder(live.ids, previewIds, movingId, parentKey)
        : rebaseMovedId(live.ids, previewIds, movingId);
    if (ids) void live.reorder(ids);
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
  const reorderControls = (key: string, shelf: DragShelf, title: string): ThreadReorderControls => {
    const target =
      shelf === "pinned"
        ? pinnedReorder
        : shelf === "sections"
          ? { isReordering: sectionGroups.isReordering }
          : inboxReorder;
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
        sectionDropRef,
        storedOrderUnitsRef,
        setDragOrder,
        commitReorder,
      }),
      onKeyDown: (event) => {
        if (!event.altKey || target.isReordering || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) {
          return;
        }
        // Sorted rows have no manual slot to move to.
        if (shelf === "inbox" && activeView.order !== "manual") return;
        event.preventDefault();
        event.stopPropagation();
        const { mode, ids: currentIds, parentKey } = reorderScopeRef.current(key, shelf);
        const ids = movePinnedIdByOffset(currentIds, key, event.key === "ArrowUp" ? -1 : 1);
        const shelfName = shelf === "pinned" ? "Pinned" : shelf === "sections" ? "sections" : "Active";
        setReorderAnnouncement(
          sameOrder(ids, currentIds)
            ? `${title} is already ${event.key === "ArrowUp" ? "first" : "last"} in ${shelfName}`
            : `${title} moved to ${ids.indexOf(key) + 1} of ${ids.length} in ${shelfName}`,
        );
        commitReorder(shelf, mode, ids, key, parentKey);
      },
    };
  };

  const isSearching = searchQuery.trim().length > 0;
  const searchCandidates = useMemo(() => filterByProjects(visibleInboxThreads(threads), scope), [scope, threads]);
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

  const { parkThread, settleThread, snoozeThread } = useLeaveActiveThread({
    lifecycle,
    navigate,
    onNavigate,
    activeThreadIdRef,
    nextThreadCandidatesRef,
  });

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
    setActiveView,
    setSettledLimit,
    toggleProjectCollapse,
  });
  const renderActiveThread = createInboxThreadRenderer(inboxContext, {
    wokeThreadIds,
    expandedChildParentIds,
    threadReorderControls,
    activeView,
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
        expandedChildParentIds={expandedChildParentIds}
        dockShelvesEnabled={dockShelvesEnabled}
        attachShelvesAutoAnimateRef={attachShelvesAutoAnimateRef}
        attachDockAutoAnimateRef={attachDockAutoAnimateRef}
        expandedShelves={expandedShelves}
        renderActiveThread={renderActiveThread}
        activeView={activeView}
        inboxProjectView={inboxProjectView}
        sections={sectionGroups}
        environmentGrouping={projectGroups}
        reorderControls={reorderControls}
        settledLimit={settledLimit}
      />
    </InboxProvider>
  );
}
