import { useCallback, useMemo, useState } from "react";
import { useRpc, type PluginSidebarSection, type PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import type { bbSidebarRpcContract } from "./contract";
import type { InboxDragOrder, SectionDrop } from "./drag-reorder-geometry";
import { visibleShelfThreads, type ReorderScope } from "./inbox-layout";
import { orderSubsetInPlace, rebaseMovedId } from "./pinned-order";
import {
  emptySectionHint,
  isSectionUnitKey,
  layoutActiveSections,
  sectionIdFromKey,
  sectionUnitKey,
  threadSectionId,
} from "./section-groups";
import { emptySectionsExpandedCodec, projectCollapseCodec } from "./lib/inbox-preference-codecs";
import { STORAGE_KEYS } from "./lib/storage-keys";
import { usePersistedPreference } from "./lib/use-persisted-preference";
import { toast } from "./lib/toast";
import { useSectionOrder } from "./useSectionOrder";

export interface SectionView {
  groups: Array<{
    key: string;
    section: PluginSidebarSection;
    threads: PluginSidebarThread[];
    threadCount: number;
    expanded: boolean;
  }>;
  loose: PluginSidebarThread[];
  empty: Array<{ section: PluginSidebarSection; hint: string }>;
  /** Threads is a drop target too, so it shows whenever any section exists. */
  showThreadsLabel: boolean;
  /** Every row in drawn order, including those inside collapsed sections. */
  orderedThreads: PluginSidebarThread[];
}

function previewOrder(keys: readonly string[], previewKeys: readonly string[]): string[] {
  return orderSubsetInPlace(
    keys.map((id) => ({ id })),
    previewKeys,
  ).map(({ id }) => id);
}

/**
 * Active grouped by bb section. Section headers keep their own saved order
 * whatever order the rows are in; rows reorder only within their section.
 */
export function useInboxSections({
  inbox,
  sections,
  dragOrder,
  manual,
  activeThreadId,
  attentionIds,
  elsewhere: shelves,
  threads,
  scope,
}: {
  inbox: readonly PluginSidebarThread[];
  sections: readonly PluginSidebarSection[];
  dragOrder: InboxDragOrder | null;
  manual: boolean;
  activeThreadId: string | null;
  attentionIds: ReadonlySet<string>;
  /** The other shelves, so an empty section can say where its threads went. */
  elsewhere: Record<
    "pinned" | "working" | "inactive" | "snoozed" | "parked" | "settled",
    readonly PluginSidebarThread[]
  >;
  threads: readonly PluginSidebarThread[];
  scope: readonly string[];
}) {
  const rpc = useRpc<typeof bbSidebarRpcContract>();
  const sectionOrder = useSectionOrder(sections);
  const [collapsed, setCollapsed] = usePersistedPreference(STORAGE_KEYS.sectionCollapse.key, projectCollapseCodec);
  const [emptyExpanded, setEmptyExpanded] = usePersistedPreference(
    STORAGE_KEYS.emptySectionsExpanded.key,
    emptySectionsExpandedCodec,
  );
  const [dropTarget, setDropTarget] = useState<string | null | undefined>(undefined);
  const toggleSectionCollapse = useCallback(
    (sectionId: string) =>
      setCollapsed((ids) => {
        const next = new Set(ids);
        if (!next.delete(sectionId)) next.add(sectionId);
        return next;
      }),
    [],
  );
  const toggleEmptyExpanded = useCallback(() => setEmptyExpanded((open) => !open), []);

  const elsewhere = useMemo(() => {
    const outOfScope =
      scope.length === 0
        ? []
        : threads.filter((thread) => !thread.isArchived && !thread.parentThreadId && !scope.includes(thread.projectId));
    return [...Object.entries(shelves), ["in other projects", outOfScope] as const];
    // The shelves object is rebuilt each render; its arrays are what change.
  }, [
    shelves.pinned,
    shelves.working,
    shelves.inactive,
    shelves.snoozed,
    shelves.parked,
    shelves.settled,
    threads,
    scope,
  ]);
  const orderedKeys = useMemo(() => {
    const keys = sectionOrder.ids.map(sectionUnitKey);
    return dragOrder?.shelf === "sections" ? previewOrder(keys, dragOrder.ids) : keys;
  }, [sectionOrder.ids, dragOrder]);
  const view = useMemo((): SectionView => {
    const layout = layoutActiveSections(inbox, sections, orderedKeys.map(sectionIdFromKey));
    return {
      groups: layout.groups.map((group) => {
        const expanded = !collapsed.has(group.section.id);
        return {
          ...group,
          threads: visibleShelfThreads(group.threads, expanded, activeThreadId, undefined, attentionIds),
          threadCount: group.threads.length,
          expanded,
        };
      }),
      loose: layout.loose,
      orderedThreads: [...layout.groups.flatMap((group) => group.threads), ...layout.loose],
      empty: layout.empty.map((section) => ({ section, hint: emptySectionHint(section.id, elsewhere) })),
      showThreadsLabel: sections.length > 0,
    };
  }, [inbox, sections, orderedKeys, collapsed, activeThreadId, attentionIds, elsewhere]);

  const orderUnits = view.groups.map((group) => ({ key: group.key, ids: group.threads.map((thread) => thread.id) }));

  const reorderScope = (key: string): ReorderScope => {
    if (isSectionUnitKey(key)) return { mode: "unit", ids: view.groups.map((group) => group.key) };
    // Sorted rows only drag to be filed under another header.
    if (!manual) return { mode: "thread", ids: [key] };
    const block = view.groups.find((group) => group.threads.some((thread) => thread.id === key))?.threads ?? view.loose;
    return { mode: "thread", ids: block.map((thread) => thread.id) };
  };

  const commitSectionOrder = (previewKeys: readonly string[], movingKey: string) => {
    const keys = rebaseMovedId(sectionOrder.ids.map(sectionUnitKey), previewKeys, movingKey);
    void sectionOrder.reorder(keys.map(sectionIdFromKey));
  };

  const sectionIds = new Set(sections.map((section) => section.id));
  const sectionDrop: SectionDrop = {
    targetAt(element, movingId) {
      const target = element?.closest<HTMLElement>("[data-section-drop]");
      if (!target) return undefined;
      const sectionId = target.dataset.sectionDrop || null;
      const moving = inbox.find((thread) => thread.id === movingId);
      return moving && threadSectionId(moving, sectionIds) !== sectionId ? sectionId : undefined;
    },
    setTarget: setDropTarget,
    drop(movingId, sectionId) {
      void rpc.call("moveThreadToSection", { threadId: movingId, sectionId }).catch((error: unknown) => {
        toast.error("Could not move thread", { description: error instanceof Error ? error.message : undefined });
      });
    },
  };

  return {
    view,
    orderedThreads: view.orderedThreads,
    orderUnits,
    reorderScope,
    commitSectionOrder,
    isReordering: sectionOrder.isReordering,
    toggleSectionCollapse,
    emptyExpanded,
    toggleEmptyExpanded,
    dropTarget,
    sectionDrop,
  };
}
