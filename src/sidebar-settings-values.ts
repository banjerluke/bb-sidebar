export const CHILD_THREAD_SORT_FIELDS = ["created", "activity"] as const;
export type ChildThreadSortField = (typeof CHILD_THREAD_SORT_FIELDS)[number];
export const CHILD_THREAD_SORT_DIRECTIONS = ["ascending", "descending"] as const;
export type ChildThreadSortDirection = (typeof CHILD_THREAD_SORT_DIRECTIONS)[number];

export const CHILD_THREAD_ICON_STYLES = ["disc", "provider"] as const;
export type ChildThreadIconStyle = (typeof CHILD_THREAD_ICON_STYLES)[number];

export const PROJECT_COLOR_DISPLAYS = ["all", "full", "grouped"] as const;
export type ProjectColorDisplay = (typeof PROJECT_COLOR_DISPLAYS)[number];

export interface ChildThreadSort {
  field: ChildThreadSortField;
  direction: ChildThreadSortDirection;
}

export interface SidebarSettingsValues {
  snoozePresets: string;
  inactiveThreadsEnabled: boolean;
  inactiveAfterHours: number;
  showRunningChildrenWhenCollapsed: boolean;
  autoSettleInactive: boolean;
  autoSettleAfterDays: number;
  autoSettleOnMerge: boolean;
  childSortField: ChildThreadSortField;
  childSortDirection: ChildThreadSortDirection;
  childIconStyle: ChildThreadIconStyle;
  /** Experimental: fold threads with live work to one line. */
  compactWorkingThreads: boolean;
  /** Experimental: move threads with live work to their own shelf. */
  workingShelf: boolean;
  /** Experimental: keep the shelves below Active docked to the bottom. */
  dockShelves: boolean;
  projectColorsEnabled: boolean;
  /** Where project stripes appear; enabled project names are always colored. */
  projectColorDisplay: ProjectColorDisplay;
}

import { DEFAULT_SNOOZE_PRESET_CONFIG } from "./lifecycle";

export const DEFAULT_SIDEBAR_SETTINGS: SidebarSettingsValues = {
  snoozePresets: DEFAULT_SNOOZE_PRESET_CONFIG,
  inactiveThreadsEnabled: true,
  inactiveAfterHours: 6,
  showRunningChildrenWhenCollapsed: true,
  autoSettleInactive: true,
  autoSettleAfterDays: 3,
  autoSettleOnMerge: true,
  childSortField: "created",
  childSortDirection: "ascending",
  childIconStyle: "disc",
  compactWorkingThreads: false,
  workingShelf: false,
  dockShelves: false,
  projectColorsEnabled: false,
  projectColorDisplay: "all",
};

export function childThreadSortOf(settings: SidebarSettingsValues | null): ChildThreadSort {
  return {
    field: settings?.childSortField ?? DEFAULT_SIDEBAR_SETTINGS.childSortField,
    direction: settings?.childSortDirection ?? DEFAULT_SIDEBAR_SETTINGS.childSortDirection,
  };
}

type ChildThreadSettings = Pick<SidebarSettingsValues, "childSortField" | "childSortDirection" | "childIconStyle">;

function oneOf<const T extends string>(allowed: readonly T[], value: unknown, fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

export function projectColorDisplayOf(value: unknown): ProjectColorDisplay {
  return oneOf(PROJECT_COLOR_DISPLAYS, value, DEFAULT_SIDEBAR_SETTINGS.projectColorDisplay);
}

/**
 * The child-thread settings from an untrusted record, such as a database row
 * or a cache written by an older version. Missing or unknown values fall back
 * to the defaults.
 */
export function childThreadSettingsOf(
  value: {
    [Key in keyof ChildThreadSettings]?: unknown;
  },
): ChildThreadSettings {
  return {
    childSortField: oneOf(CHILD_THREAD_SORT_FIELDS, value.childSortField, DEFAULT_SIDEBAR_SETTINGS.childSortField),
    childSortDirection: oneOf(
      CHILD_THREAD_SORT_DIRECTIONS,
      value.childSortDirection,
      DEFAULT_SIDEBAR_SETTINGS.childSortDirection,
    ),
    childIconStyle: oneOf(CHILD_THREAD_ICON_STYLES, value.childIconStyle, DEFAULT_SIDEBAR_SETTINGS.childIconStyle),
  };
}
