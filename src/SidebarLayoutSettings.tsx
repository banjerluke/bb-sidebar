import { MAX_INACTIVE_AFTER_HOURS, MIN_INACTIVE_AFTER_HOURS } from "./inactive";
import { THREAD_DISPLAYS, type ThreadDisplay } from "./sidebar-settings-values";
import {
  InlineNumber,
  SettingRow,
  SettingsSection,
  SettingsSelect,
  Switch,
  type SettingsDraftSectionProps,
} from "./settings-ui";

const THREAD_DISPLAY_LABELS: Record<ThreadDisplay, string> = {
  full: "Full cards",
  "compact-working": "Compact working threads",
};

export function SidebarLayoutSettings({
  draft,
  update,
  status,
  inactiveHoursValid,
}: SettingsDraftSectionProps & { inactiveHoursValid: boolean }) {
  return (
    <SettingsSection title="Sidebar layout" status={status}>
      <SettingRow
        title="Thread display"
        experimental
        description="Full cards show each thread on three lines. Compact working threads use one line while a thread or its child agents are working, and expand when work finishes, fails, or needs you."
        control={
          <SettingsSelect
            aria-label="Thread display"
            value={draft.threadDisplay}
            onChange={(event) => update("threadDisplay", event.target.value as ThreadDisplay)}
            className="w-52"
          >
            {THREAD_DISPLAYS.map((display) => (
              <option key={display} value={display}>
                {THREAD_DISPLAY_LABELS[display]}
              </option>
            ))}
          </SettingsSelect>
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
