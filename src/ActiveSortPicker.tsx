import { useId, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import { ACTIVE_GROUPINGS, ACTIVE_ORDERS, type ActiveView } from "./inbox-layout";
import { Icon } from "./components/Icon";
import { Popover, PopoverContent, PopoverTrigger } from "./components/Popover";
import { cn } from "./lib/utils";

const GROUP_LABELS: Record<ActiveView["group"], string> = {
  none: "No grouping",
  project: "Project",
  section: "Section",
};

const ORDER_LABELS: Record<ActiveView["order"], string> = {
  manual: "Manual order",
  activity: "Recent activity",
  created: "Date created",
};

function viewLabel(view: ActiveView): string {
  return view.group === "none" ? ORDER_LABELS[view.order] : `${GROUP_LABELS[view.group]}, ${ORDER_LABELS[view.order]}`;
}

export function ActiveSortPicker({
  view,
  onViewChange,
  groupEnvironments,
  onGroupEnvironmentsChange,
}: {
  view: ActiveView;
  onViewChange: (view: ActiveView) => void;
  groupEnvironments: boolean;
  onGroupEnvironmentsChange: (enabled: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const groupName = useId();
  const orderName = useId();
  const contentRef = useRef<HTMLDivElement>(null);
  const label = `Sort active threads: ${viewLabel(view)}`;
  // A grouping is usually followed by an order, so only an order choice closes.
  const closeOnCommit = (closes: boolean) => ({
    onClick: (event: MouseEvent) => {
      if (event.detail > 0 && closes) setOpen(false);
    },
    onKeyDown: (event: KeyboardEvent) => {
      if (event.key === "Enter" && closes) {
        event.preventDefault();
        setOpen(false);
      }
    },
  });
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={label}
          title={label}
          onKeyDown={(event) => {
            if (!open && ["Enter", " ", "ArrowDown", "ArrowUp"].includes(event.key)) {
              event.preventDefault();
              setOpen(true);
            }
          }}
          className={cn(
            "absolute bottom-1 right-[1.875rem] z-10 flex size-4 items-center justify-between rounded-md border-0 bg-transparent p-0 text-muted-foreground/40 shadow-none transition-colors duration-150 hover:bg-sidebar-accent hover:text-muted-foreground hover:duration-0 focus:outline-none focus:ring-0 focus-visible:ring-1 focus-visible:ring-ring",
            (view.group !== "none" || view.order !== "manual") && "bg-sidebar-accent/60 text-muted-foreground/80",
          )}
        >
          <Icon name="ArrowUpDown" className="size-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        ref={contentRef}
        align="end"
        aria-label="Sort active threads"
        className="min-w-48 p-1"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          contentRef.current?.querySelector<HTMLInputElement>('input[type="radio"]:checked')?.focus();
        }}
      >
        <div role="radiogroup" aria-label="Group by">
          <p className="px-2 pb-0.5 pt-1 text-2xs text-muted-foreground">Group by</p>
          {ACTIVE_GROUPINGS.map((group) => (
            <Choice
              key={group}
              name={groupName}
              label={GROUP_LABELS[group]}
              checked={view.group === group}
              onChange={() => onViewChange({ ...view, group })}
              {...closeOnCommit(false)}
            />
          ))}
        </div>
        <div role="radiogroup" aria-label="Order" className="mt-1 border-t border-border pt-1">
          <p className="px-2 pb-0.5 pt-1 text-2xs text-muted-foreground">Order</p>
          {ACTIVE_ORDERS.map((order) => (
            <Choice
              key={order}
              name={orderName}
              label={ORDER_LABELS[order]}
              checked={view.order === order}
              onChange={() => onViewChange({ ...view, order })}
              {...closeOnCommit(true)}
            />
          ))}
        </div>
        {view.group === "project" ? (
          <div className="mt-1 border-t border-border pt-1">
            <Choice
              type="checkbox"
              label="Group by worktree"
              checked={groupEnvironments}
              onChange={() => onGroupEnvironmentsChange(!groupEnvironments)}
            />
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

function Choice({
  type = "radio",
  name,
  label,
  checked,
  onChange,
  onClick,
  onKeyDown,
}: {
  type?: "radio" | "checkbox";
  name?: string;
  label: string;
  checked: boolean;
  onChange: () => void;
  onClick?: (event: MouseEvent) => void;
  onKeyDown?: (event: KeyboardEvent) => void;
}) {
  return (
    <label className="block cursor-default">
      <input
        type={type}
        name={name}
        checked={checked}
        className="peer sr-only"
        onChange={onChange}
        onClick={onClick}
        onKeyDown={onKeyDown}
      />
      <span className="flex items-center justify-between gap-4 rounded-sm px-2 py-1.5 text-xs hover:bg-state-hover peer-focus-visible:bg-state-hover">
        {label}
        <span className="flex size-3.5 items-center justify-center">
          {checked ? <Icon name="Check" className="size-4" aria-hidden /> : null}
        </span>
      </span>
    </label>
  );
}
