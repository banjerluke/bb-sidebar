import type { ServerContext } from "./server-context";
import { sidebarSettingsSchema } from "./contract";
import {
  childThreadSettingsOf,
  DEFAULT_SIDEBAR_SETTINGS,
  projectColorDisplayOf,
  type SidebarSettingsValues,
} from "./sidebar-settings-values";
interface SidebarSettingsDbRow {
  snooze_presets: string;
  inactive_threads_enabled: number;
  inactive_after_hours: number;
  show_running_children_when_collapsed: number;
  auto_settle_inactive: number;
  auto_settle_after_days: number;
  auto_settle_on_merge: number;
  child_sort_field: string;
  child_sort_direction: string;
  child_icon_style: string;
  compact_working_threads: number;
  working_shelf: number;
  dock_shelves: number;
  project_colors_enabled: number;
  project_color_display: string;
}

export async function createServerSettings(ctx: ServerContext) {
  const readSidebarSettings = (): SidebarSettingsValues => {
    const row = ctx.db
      .prepare(
        `SELECT snooze_presets, inactive_threads_enabled,
                inactive_after_hours, show_running_children_when_collapsed,
                auto_settle_inactive,
                auto_settle_after_days, auto_settle_on_merge,
                child_sort_field, child_sort_direction, child_icon_style,
                compact_working_threads, working_shelf, dock_shelves,
                project_colors_enabled, project_color_display
           FROM sidebar_settings
          WHERE id = 1`,
      )
      .get() as SidebarSettingsDbRow | undefined;
    return row
      ? {
          snoozePresets: row.snooze_presets,
          inactiveThreadsEnabled: row.inactive_threads_enabled === 1,
          inactiveAfterHours: row.inactive_after_hours,
          showRunningChildrenWhenCollapsed: row.show_running_children_when_collapsed === 1,
          autoSettleInactive: row.auto_settle_inactive === 1,
          autoSettleAfterDays: row.auto_settle_after_days,
          autoSettleOnMerge: row.auto_settle_on_merge === 1,
          ...childThreadSettingsOf({
            childSortField: row.child_sort_field,
            childSortDirection: row.child_sort_direction,
            childIconStyle: row.child_icon_style,
          }),
          compactWorkingThreads: row.compact_working_threads === 1,
          workingShelf: row.working_shelf === 1,
          dockShelves: row.dock_shelves === 1,
          projectColorsEnabled: row.project_colors_enabled === 1,
          projectColorDisplay: projectColorDisplayOf(row.project_color_display),
        }
      : { ...DEFAULT_SIDEBAR_SETTINGS };
  };

  const writeSidebarSettings = (values: SidebarSettingsValues): void => {
    ctx.db
      .prepare(
        `INSERT INTO sidebar_settings (
         id, snooze_presets, inactive_threads_enabled,
         inactive_after_hours, show_running_children_when_collapsed,
         auto_settle_inactive,
         auto_settle_after_days, auto_settle_on_merge,
         child_sort_field, child_sort_direction, child_icon_style,
         compact_working_threads, working_shelf, dock_shelves,
         project_colors_enabled, project_color_display
       ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         snooze_presets = excluded.snooze_presets,
         inactive_threads_enabled = excluded.inactive_threads_enabled,
         inactive_after_hours = excluded.inactive_after_hours,
         show_running_children_when_collapsed =
           excluded.show_running_children_when_collapsed,
         auto_settle_inactive = excluded.auto_settle_inactive,
         auto_settle_after_days = excluded.auto_settle_after_days,
         auto_settle_on_merge = excluded.auto_settle_on_merge,
         child_sort_field = excluded.child_sort_field,
         child_sort_direction = excluded.child_sort_direction,
         child_icon_style = excluded.child_icon_style,
         compact_working_threads = excluded.compact_working_threads,
         working_shelf = excluded.working_shelf,
         dock_shelves = excluded.dock_shelves,
         project_colors_enabled = excluded.project_colors_enabled,
         project_color_display = excluded.project_color_display`,
      )
      .run(
        values.snoozePresets,
        values.inactiveThreadsEnabled ? 1 : 0,
        values.inactiveAfterHours,
        values.showRunningChildrenWhenCollapsed ? 1 : 0,
        values.autoSettleInactive ? 1 : 0,
        values.autoSettleAfterDays,
        values.autoSettleOnMerge ? 1 : 0,
        values.childSortField,
        values.childSortDirection,
        values.childIconStyle,
        values.compactWorkingThreads ? 1 : 0,
        values.workingShelf ? 1 : 0,
        values.dockShelves ? 1 : 0,
        values.projectColorsEnabled ? 1 : 0,
        values.projectColorDisplay,
      );
  };

  const hasStoredSidebarSettings = ctx.db.prepare(`SELECT 1 FROM sidebar_settings WHERE id = 1`).get() !== undefined;
  if (!hasStoredSidebarSettings) {
    try {
      const legacy = await ctx.bb.sdk.plugins.getSettings({
        pluginId: ctx.bb.pluginId,
      });
      const values = legacy.values;
      const hasLegacyValues = [
        "snoozePresets",
        "inactiveThreadsEnabled",
        "inactiveAfterHours",
        "showRunningChildrenWhenCollapsed",
        "autoSettleInactive",
        "autoSettleAfterDays",
        "autoSettleOnMerge",
      ].some((key) => key in values);
      const migrated = sidebarSettingsSchema.safeParse({
        snoozePresets:
          typeof values.snoozePresets === "string" ? values.snoozePresets : DEFAULT_SIDEBAR_SETTINGS.snoozePresets,
        inactiveThreadsEnabled:
          typeof values.inactiveThreadsEnabled === "boolean"
            ? values.inactiveThreadsEnabled
            : DEFAULT_SIDEBAR_SETTINGS.inactiveThreadsEnabled,
        inactiveAfterHours:
          typeof values.inactiveAfterHours === "string"
            ? Number(values.inactiveAfterHours)
            : DEFAULT_SIDEBAR_SETTINGS.inactiveAfterHours,
        showRunningChildrenWhenCollapsed:
          typeof values.showRunningChildrenWhenCollapsed === "boolean"
            ? values.showRunningChildrenWhenCollapsed
            : DEFAULT_SIDEBAR_SETTINGS.showRunningChildrenWhenCollapsed,
        autoSettleInactive:
          typeof values.autoSettleInactive === "boolean"
            ? values.autoSettleInactive
            : DEFAULT_SIDEBAR_SETTINGS.autoSettleInactive,
        autoSettleAfterDays:
          typeof values.autoSettleAfterDays === "string"
            ? Number(values.autoSettleAfterDays)
            : DEFAULT_SIDEBAR_SETTINGS.autoSettleAfterDays,
        autoSettleOnMerge:
          typeof values.autoSettleOnMerge === "boolean"
            ? values.autoSettleOnMerge
            : DEFAULT_SIDEBAR_SETTINGS.autoSettleOnMerge,
        childSortField: DEFAULT_SIDEBAR_SETTINGS.childSortField,
        childSortDirection: DEFAULT_SIDEBAR_SETTINGS.childSortDirection,
        childIconStyle: DEFAULT_SIDEBAR_SETTINGS.childIconStyle,
        compactWorkingThreads: DEFAULT_SIDEBAR_SETTINGS.compactWorkingThreads,
        workingShelf: DEFAULT_SIDEBAR_SETTINGS.workingShelf,
        dockShelves: DEFAULT_SIDEBAR_SETTINGS.dockShelves,
        projectColorsEnabled: false,
        projectColorDisplay: DEFAULT_SIDEBAR_SETTINGS.projectColorDisplay,
      });
      if (hasLegacyValues && migrated.success) {
        writeSidebarSettings(migrated.data);
      }
    } catch {
      // A new install has no previous settings generation to migrate.
    }
  }

  return { readSidebarSettings, writeSidebarSettings };
}
