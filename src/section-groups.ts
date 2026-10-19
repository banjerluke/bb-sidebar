import type { PluginSidebarSection, PluginSidebarThread } from "@get-bb/plugin-sdk";

// Thread ids never take this form, so a section key cannot collide with one.
const SECTION_UNIT_KEY_PREFIX = "section:";

export function sectionUnitKey(sectionId: string): string {
  return `${SECTION_UNIT_KEY_PREFIX}${sectionId}`;
}

export function isSectionUnitKey(key: string): boolean {
  return key.startsWith(SECTION_UNIT_KEY_PREFIX);
}

export function sectionIdFromKey(key: string): string {
  return key.slice(SECTION_UNIT_KEY_PREFIX.length);
}

/**
 * Saved order first, then sections this device has not ordered yet in bb's
 * creation order, so a new section lands at the end. Saved ids of deleted
 * sections are skipped.
 */
export function orderSectionIds(
  sections: readonly PluginSidebarSection[],
  storedIds: readonly string[] | null,
): string[] {
  const known = new Set(sections.map((section) => section.id));
  const ordered = (storedIds ?? []).filter((id) => known.has(id));
  const placed = new Set(ordered);
  return [...ordered, ...sections.filter((section) => !placed.has(section.id)).map((section) => section.id)];
}

/** The section a thread is drawn in; a deleted or unknown section reads as none. */
export function threadSectionId(
  thread: Pick<PluginSidebarThread, "sectionId">,
  sectionIds: ReadonlySet<string>,
): string | null {
  return thread.sectionId && sectionIds.has(thread.sectionId) ? thread.sectionId : null;
}

interface SectionGroup {
  key: string;
  section: PluginSidebarSection;
  threads: PluginSidebarThread[];
}

/**
 * Active rows by section: sections with rows in header order, sections with
 * none, and the unsectioned rows. Rows keep their incoming order.
 */
export function layoutActiveSections(
  threads: readonly PluginSidebarThread[],
  sections: readonly PluginSidebarSection[],
  orderedIds: readonly string[],
): { groups: SectionGroup[]; empty: PluginSidebarSection[]; loose: PluginSidebarThread[] } {
  const sectionById = new Map(sections.map((section) => [section.id, section]));
  const ids = new Set(sectionById.keys());
  const rows = new Map<string, PluginSidebarThread[]>();
  const loose: PluginSidebarThread[] = [];
  for (const thread of threads) {
    const sectionId = threadSectionId(thread, ids);
    if (sectionId === null) {
      loose.push(thread);
      continue;
    }
    const bucket = rows.get(sectionId);
    if (bucket) bucket.push(thread);
    else rows.set(sectionId, [thread]);
  }
  const groups: SectionGroup[] = [];
  const empty: PluginSidebarSection[] = [];
  for (const id of orderedIds) {
    const section = sectionById.get(id);
    if (!section) continue;
    const sectionThreads = rows.get(id);
    if (sectionThreads) groups.push({ key: sectionUnitKey(id), section, threads: sectionThreads });
    else empty.push(section);
  }
  return { groups, empty, loose };
}

/** Where an empty section's threads are instead, e.g. "2 parked · 1 pinned". */
export function emptySectionHint(
  sectionId: string,
  elsewhere: ReadonlyArray<readonly [label: string, threads: readonly Pick<PluginSidebarThread, "sectionId">[]]>,
): string {
  const parts = elsewhere.flatMap(([label, threads]) => {
    const count = threads.filter((thread) => thread.sectionId === sectionId).length;
    return count > 0 ? [`${count} ${label}`] : [];
  });
  return parts.length > 0 ? parts.join(" · ") : "No threads";
}
