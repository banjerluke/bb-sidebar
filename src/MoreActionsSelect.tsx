import { useEffect, useState } from "react";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
} from "./components/Select";
import { Icon } from "./components/Icon";
import { Tooltip } from "./components/Tooltip";
import { SnoozePickerDialog } from "./SnoozePickerDialog";
import { formatSnoozeWakeTime, resolveConfiguredSnoozePreset, type ConfiguredSnoozePreset } from "./lifecycle";

/**
 * The chevron half of the settle split button: every other way to clear a row
 * off Active, so the check can stay a single click.
 */
export function MoreActionsSelect({
  label,
  snoozePresets,
  triggerClassName,
  onOpenChange,
  onSnooze,
  onPark,
  onArchive,
}: {
  label: string;
  snoozePresets: readonly ConfiguredSnoozePreset[];
  triggerClassName: string;
  onOpenChange?: (open: boolean) => void;
  onSnooze: (snoozedUntil: number) => void;
  onPark: () => void;
  onArchive: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [picking, setPicking] = useState(false);
  // The row keeps its actions revealed until the picker closes too.
  const open = menuOpen || picking;
  useEffect(() => {
    onOpenChange?.(open);
  }, [open, onOpenChange]);
  return (
    <>
      <Select
        value=""
        onOpenChange={setMenuOpen}
        onValueChange={(value) => {
          if (value === "pick") {
            setPicking(true);
            return;
          }
          if (value === "park") {
            onPark();
            return;
          }
          if (value === "archive") {
            onArchive();
            return;
          }
          const preset = snoozePresets.find((item) => item.id === value);
          if (preset) {
            const wake = resolveConfiguredSnoozePreset(preset);
            if (wake !== null) onSnooze(wake);
          }
        }}
      >
        <Tooltip label={label}>
          <SelectTrigger aria-label={label} className={`${triggerClassName} [&>svg:last-child]:hidden`}>
            <Icon name="ChevronDown" className="size-3" />
          </SelectTrigger>
        </Tooltip>
        <SelectContent align="end">
          {snoozePresets.length > 0 ? (
            <>
              <SelectGroup>
                <SelectLabel>Snooze</SelectLabel>
                {snoozePresets.map((preset) => {
                  const wake = resolveConfiguredSnoozePreset(preset);
                  return (
                    <SelectItem
                      key={preset.id}
                      value={preset.id}
                      className="text-xs"
                      disabled={wake === null}
                      title={wake === null ? "Today's time has passed" : formatSnoozeWakeTime(wake)}
                    >
                      {preset.label}
                    </SelectItem>
                  );
                })}
                <SelectItem value="pick" className="text-xs">
                  <span className="flex items-center gap-2">
                    <Icon name="Calendar" className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                    Pick date & time…
                  </span>
                </SelectItem>
              </SelectGroup>
              <SelectSeparator className="my-1 h-px bg-border" />
            </>
          ) : null}
          <SelectItem value="park" className="text-xs">
            <span className="flex items-center gap-2">
              <Icon name="Car" className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
              Park thread
            </span>
          </SelectItem>
          <SelectItem value="archive" className="text-xs">
            <span className="flex items-center gap-2">
              <Icon name="Archive" className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
              Archive
            </span>
          </SelectItem>
        </SelectContent>
      </Select>
      <SnoozePickerDialog open={picking} onOpenChange={setPicking} onSnooze={onSnooze} />
    </>
  );
}
