import { MAX_INACTIVE_AFTER_HOURS, MIN_INACTIVE_AFTER_HOURS } from "./inactive";
import { InlineNumber, SettingRow, SettingsSection, Switch, type SettingsDraftSectionProps } from "./settings-ui";

export function SidebarLayoutSettings({
  draft,
  update,
  status,
  inactiveHoursValid,
}: SettingsDraftSectionProps & { inactiveHoursValid: boolean }) {
  return (
    <SettingsSection title="Sidebar layout" status={status}>
      <SettingRow
        title="Compact working threads"
        experimental
        description="Use one line while a thread or its child agents are working. Expand it when work finishes, fails, or needs you."
        control={
          <Switch
            label="Compact working threads"
            checked={draft.compactWorkingThreads}
            onChange={(checked) => update("compactWorkingThreads", checked)}
          />
        }
      />
      <SettingRow
        title="Working shelf"
        experimental
        description="Keep working threads in their own shelf. They return to Active when work finishes, fails, or needs you. Pinned threads stay pinned."
        control={
          <Switch
            label="Working shelf"
            checked={draft.workingShelf}
            onChange={(checked) => update("workingShelf", checked)}
          />
        }
      />
      <SettingRow
        title="Inactive shelf"
        description="Move quiet, unpinned threads out of Active. New activity brings them back."
        control={
          <Switch
            label="Inactive shelf"
            checked={draft.inactiveThreadsEnabled}
            onChange={(checked) => update("inactiveThreadsEnabled", checked)}
          />
        }
      >
        {draft.inactiveThreadsEnabled ? (
          <InlineNumber
            label="Hours before inactive"
            prefix="After"
            suffix="hours without activity"
            value={draft.inactiveAfterHours}
            min={MIN_INACTIVE_AFTER_HOURS}
            max={MAX_INACTIVE_AFTER_HOURS}
            valid={inactiveHoursValid}
            errorId="inactive-hours-error"
            onChange={(value) => update("inactiveAfterHours", value)}
          />
        ) : null}
      </SettingRow>

      <SettingRow
        title="Dock shelves to the bottom"
        experimental
        description="Keep shelves below Active at the bottom of the sidebar. Expanded shelves scroll with the thread list."
        control={
          <Switch
            label="Dock shelves to the bottom"
            checked={draft.dockShelves}
            onChange={(checked) => update("dockShelves", checked)}
          />
        }
      />
    </SettingsSection>
  );
}
