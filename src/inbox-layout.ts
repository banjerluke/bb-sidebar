import type { PluginSidebarThread } from "@get-bb/plugin-sdk";
import type { OrderUnit } from "./pinned-order";
import { visibleInboxThreads } from "./inbox";

export const ACTIVE_GROUPINGS = ["none", "project", "section"] as const;
export type ActiveGrouping = (typeof ACTIVE_GROUPINGS)[number];
export const ACTIVE_ORDERS = ["manual", "activity", "created"] as const;
export type ActiveOrder = (typeof ACTIVE_ORDERS)[number];

/** How Active is drawn: grouped by project or section, or flat, in one order. */
export interface ActiveView {
  group: ActiveGrouping;
  order: ActiveOrder;
}

export type ReorderMode = "thread" | "unit";
export interface ReorderScope {
  mode: ReorderMode;
  ids: string[];
  parentKey?: string | null;
}

export function isActiveGrouping(value: unknown): value is ActiveGrouping {
  return ACTIVE_GROUPINGS.some((group) => group === value);
}

export function isActiveOrder(value: unknown): value is ActiveOrder {
  return ACTIVE_ORDERS.some((order) => order === value);
}

export type ProjectViewUnit =
  | Extract<ProjectUnit, { kind: "thread" }>
  | (Omit<Extract<ProjectUnit, { kind: "group" }>, "children"> & {
      expanded: boolean;
      threadCount: number;
      children?: ProjectViewUnit[];
    });

export type ProjectUnit =
  | { kind: "thread"; key: string; thread: PluginSidebarThread }
  | {
      kind: "group";
      key: string;
      projectId: string;
      threads: PluginSidebarThread[];
      children?: ProjectUnit[];
      environment?: NonNullable<PluginSidebarThread["environment"]>;
    };

// Thread ids never take this form, so a project key cannot collide with one.
const PROJECT_UNIT_KEY_PREFIX = "project:";

export function projectUnitKey(projectId: string): string {
  return `${PROJECT_UNIT_KEY_PREFIX}${projectId}`;
}

/**
 * The project view: every project is drawn once, where its first thread sits,
 * so in a sorted order the project with the newest thread leads. Moving a
 * unit moves all of its threads, so a dragged group stays together.
 */
export function layoutActiveThreadsByProject(inbox: readonly PluginSidebarThread[]): ProjectUnit[] {
  const units: ProjectUnit[] = [];
  const groups = new Map<string, PluginSidebarThread[]>();
  for (const thread of inbox) {
    const existing = groups.get(thread.projectId);
    if (existing) {
      existing.push(thread);
      continue;
    }
    const threads = [thread];
    groups.set(thread.projectId, threads);
    units.push({
      kind: "group",
      key: projectUnitKey(thread.projectId),
      projectId: thread.projectId,
      threads,
    });
  }
  return units;
}

export function projectOrderUnits(units: readonly ProjectUnit[]): OrderUnit[] {
  return units.map((unit) => ({
    key: unit.key,
    ids: unit.kind === "thread" ? [unit.thread.id] : unit.threads.map((thread) => thread.id),
  }));
}

/** Expand a preview of unit keys into the thread order it stands for. */
export function expandProjectUnits(keys: readonly string[], units: readonly ProjectUnit[]): string[] {
  const idsByKey = new Map(projectOrderUnits(units).map((unit) => [unit.key, unit.ids]));
  return keys.flatMap((key) => idsByKey.get(key) ?? []);
}

export function sameOrder(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

export function sortActiveThreads(threads: readonly PluginSidebarThread[], order: ActiveOrder): PluginSidebarThread[] {
  if (order === "manual") return [...threads];
  const primaryKey = order === "activity" ? "updatedAt" : "createdAt";
  return [...threads].sort(
    (left, right) =>
      right[primaryKey] - left[primaryKey] || right.updatedAt - left.updatedAt || right.createdAt - left.createdAt,
  );
}

export function visibleShelfThreads(
  threads: readonly PluginSidebarThread[],
  expanded: boolean,
  activeThreadId: string | null,
  limit = threads.length,
  attentionParentIds?: ReadonlySet<string>,
): PluginSidebarThread[] {
  if (!expanded) {
    return threads.filter((thread) => thread.id === activeThreadId || attentionParentIds?.has(thread.id));
  }
  return threads.filter((thread, index) => index < limit || thread.id === activeThreadId);
}

/** Closest ancestor represented by an actual flat shelf row in this scope. */
export function activeRepresentativeThreadId(
  threads: readonly PluginSidebarThread[],
  threadId: string | null,
  flatRows: readonly PluginSidebarThread[],
): string | null {
  const visibleById = new Map(visibleInboxThreads(threads).map((thread) => [thread.id, thread] as const));
  const flatIds = new Set(flatRows.map((thread) => thread.id));
  const visited = new Set<string>();
  let current = threadId === null ? undefined : visibleById.get(threadId);
  while (current && !visited.has(current.id)) {
    if (flatIds.has(current.id)) return current.id;
    visited.add(current.id);
    current = current.parentThreadId ? visibleById.get(current.parentThreadId) : undefined;
  }
  return null;
}
