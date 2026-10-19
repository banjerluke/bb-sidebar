import { useSidebarThreads } from "./bb-sdk";
import { useEffect, useRef, useState } from "react";
import * as ContextMenu from "@radix-ui/react-context-menu";
import { useRpc, useSdk, type PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import { toast } from "./lib/toast";
import type { bbSidebarRpcContract } from "./contract";
import { Icon } from "./components/Icon";
import { usePortalScopeProps } from "./lib/portal-scope";
import { useSectionOrderIds } from "./useSectionOrder";
import { threadSectionId } from "./section-groups";

const UNSECTIONED = "";

/** Files a thread, with its whole tree, in a bb section or back in Threads. */
export function SectionMenu({ thread }: { thread: PluginSidebarThread }) {
  const { sections } = useSidebarThreads();
  const orderedIds = useSectionOrderIds(sections);
  const rpc = useRpc<typeof bbSidebarRpcContract>();
  const sdk = useSdk();
  const portalScope = usePortalScopeProps();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const inFlight = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const createRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    // Focus after Radix finishes moving focus into the submenu.
    const timer = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [open]);
  const sectionById = new Map(sections.map((section) => [section.id, section]));
  const current = threadSectionId(thread, new Set(sectionById.keys())) ?? UNSECTIONED;

  const run = async (move: () => Promise<string | null>, failure: string) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setSaving(true);
    try {
      const sectionId = await move();
      await rpc.call("moveThreadToSection", { threadId: thread.id, sectionId });
    } catch (error) {
      toast.error(failure, { description: error instanceof Error ? error.message : undefined });
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  };
  const moveTo = (value: string) => {
    if (value === current) return;
    void run(async () => value || null, "Could not move thread");
  };
  const create = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    void run(async () => (await sdk.threadSections.create({ name: trimmed })).id, "Could not create section");
  };

  return (
    <ContextMenu.Sub
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (nextOpen) setName("");
      }}
    >
      <ContextMenu.SubTrigger
        disabled={saving}
        className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-[0.3125rem] text-xs outline-none data-[state=open]:bg-accent data-[highlighted]:bg-accent data-[disabled]:opacity-50"
      >
        <Icon name="Folder" className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        Move to section
        <Icon name="ChevronRight" className="ml-auto size-4 opacity-60" />
      </ContextMenu.SubTrigger>
      <ContextMenu.Portal>
        <ContextMenu.SubContent
          {...portalScope}
          ref={contentRef}
          aria-label="Move to section"
          sideOffset={4}
          className="z-50 w-56 max-w-[calc(100vw-2rem)] rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-md"
        >
          <ContextMenu.RadioGroup value={current} onValueChange={moveTo} className="max-h-64 overflow-y-auto">
            {[...orderedIds.map((id) => sectionById.get(id)!), { id: UNSECTIONED, name: "Threads" }].map((section) => (
              <ContextMenu.RadioItem
                key={section.id}
                value={section.id}
                disabled={saving}
                textValue={section.name}
                className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-[0.3125rem] text-xs outline-none data-[highlighted]:bg-accent data-[disabled]:opacity-50"
              >
                <span className="flex-1 truncate">{section.name}</span>
                <ContextMenu.ItemIndicator>
                  <Icon name="Check" className="size-4" />
                </ContextMenu.ItemIndicator>
              </ContextMenu.RadioItem>
            ))}
          </ContextMenu.RadioGroup>
          <div className="mt-1 flex items-center gap-2 border-t border-border px-2 pb-1 pt-2">
            <Icon name="Plus" className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <input
              ref={inputRef}
              aria-label="New section name"
              placeholder="New section…"
              value={name}
              disabled={saving}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape" || event.key === "Tab") return;
                // Keep menu typeahead and arrow-left navigation out of the input.
                event.stopPropagation();
                if (event.key === "Enter") {
                  event.preventDefault();
                  // Selecting the item closes the whole menu, as any other choice does.
                  createRef.current?.click();
                } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                  event.preventDefault();
                  const items = contentRef.current?.querySelectorAll<HTMLElement>(
                    '[role="menuitemradio"]:not([data-disabled])',
                  );
                  (event.key === "ArrowDown" ? items?.[0] : items?.[items.length - 1])?.focus();
                }
              }}
              className="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
            />
          </div>
          {name.trim() ? (
            <ContextMenu.Item
              ref={createRef}
              disabled={saving}
              onSelect={create}
              className="flex cursor-pointer items-center gap-2 truncate rounded-md px-2 py-[0.3125rem] text-xs outline-none data-[highlighted]:bg-accent data-[disabled]:opacity-50"
            >
              Create “{name.trim()}”
            </ContextMenu.Item>
          ) : null}
        </ContextMenu.SubContent>
      </ContextMenu.Portal>
    </ContextMenu.Sub>
  );
}
