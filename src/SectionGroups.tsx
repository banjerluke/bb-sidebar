import { useSidebarThreads } from "./bb-sdk";
import { useRef, useState, type ReactNode } from "react";
import * as ContextMenu from "@radix-ui/react-context-menu";
import * as Dialog from "@radix-ui/react-dialog";
import { useSdk, type PluginSidebarSection, type PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import { Icon } from "./components/Icon";
import { cn } from "./lib/utils";
import { toast } from "./lib/toast";
import { usePortalScopeProps } from "./lib/portal-scope";
import { useListMotion } from "./useListMotion";
import { TRAILING_GLYPH_BOX_CLASS } from "./StatusSlot";
import type { ThreadReorderControls } from "./ThreadCard";
import type { SectionView } from "./useInboxSections";

const HEADER_CLASS = "flex w-full touch-pan-y items-center gap-1.5 px-2.5 pb-0.5 pt-2 text-left text-2xs";
const DROP_TARGET_CLASS = "rounded-md bg-sidebar-accent ring-1 ring-sidebar-ring/60";

/** Active grouped by section: sections in their saved order, then Threads, then empty sections. */
export function SectionGroups({
  view,
  dropTarget,
  emptyExpanded,
  onToggleEmpty,
  onToggleSection,
  reorderControls,
  renderThread,
}: {
  view: SectionView;
  dropTarget: string | null | undefined;
  emptyExpanded: boolean;
  onToggleEmpty: () => void;
  onToggleSection: (sectionId: string) => void;
  reorderControls: (key: string, name: string) => ThreadReorderControls;
  renderThread: (thread: PluginSidebarThread) => ReactNode;
}) {
  const attachListMotionRef = useListMotion<HTMLUListElement>();
  const attachLooseMotionRef = useListMotion<HTMLUListElement>();
  return (
    <ul ref={attachListMotionRef} className="flex flex-col gap-px">
      {view.groups.map((group) => {
        const reorder = reorderControls(group.key, group.section.name);
        return (
          // One item of the section list, so a whole section is one drop target
          // when sections are dragged around each other.
          <li
            key={group.key}
            data-reorder-unit={group.key}
            className={cn(
              "list-none rounded-md",
              reorder.isDragging && "relative z-20 bg-sidebar-accent shadow-lg ring-1 ring-sidebar-border",
            )}
          >
            <section data-drag-visual="" aria-label={`${group.section.name} section`}>
              <SectionActions section={group.section}>
                {(rename) => (
                  <button
                    type="button"
                    data-reorder-key={group.key}
                    data-section-drop={group.section.id}
                    onClick={() => onToggleSection(group.section.id)}
                    onPointerDown={reorder.onPointerDown}
                    onKeyDown={reorder.onKeyDown}
                    aria-expanded={group.expanded}
                    aria-label={`${group.section.name} (${group.threadCount})`}
                    aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown"
                    className={cn(
                      HEADER_CLASS,
                      !reorder.disabled && "cursor-grab active:cursor-grabbing",
                      dropTarget === group.section.id && DROP_TARGET_CLASS,
                    )}
                  >
                    <Icon name="Folder" className="size-3 shrink-0 text-muted-foreground/60" aria-hidden />
                    {rename ?? (
                      <span className="min-w-0 truncate font-medium text-muted-foreground">{group.section.name}</span>
                    )}
                    <span className="shrink-0 text-muted-foreground/50">{group.threadCount}</span>
                    <span className="h-px flex-1 bg-sidebar-border/50" />
                    <span className={TRAILING_GLYPH_BOX_CLASS}>
                      <Icon
                        name="ChevronDown"
                        className={cn(
                          "size-3 text-muted-foreground/50 transition-transform duration-150 ease-out motion-reduce:transition-none",
                          group.expanded && "rotate-180",
                        )}
                      />
                    </span>
                  </button>
                )}
              </SectionActions>
              <ul aria-label={`${group.section.name} active threads`} className="flex flex-col gap-px">
                {group.threads.map(renderThread)}
              </ul>
            </section>
          </li>
        );
      })}
      <li className="list-none">
        <section aria-label="Threads">
          {view.showThreadsLabel ? (
            <h3
              data-section-drop=""
              className={cn(HEADER_CLASS, "text-muted-foreground", dropTarget === null && DROP_TARGET_CLASS)}
            >
              <span className="font-medium">Threads</span>
              <span className="shrink-0 text-muted-foreground/50">{view.loose.length}</span>
              <span className="h-px flex-1 bg-sidebar-border/50" />
            </h3>
          ) : null}
          <ul ref={attachLooseMotionRef} className="flex flex-col gap-px">
            {view.loose.map(renderThread)}
          </ul>
        </section>
      </li>
      {view.empty.length > 0 ? (
        <li className="list-none">
          <button
            type="button"
            aria-expanded={emptyExpanded}
            onClick={onToggleEmpty}
            className={cn(HEADER_CLASS, "pb-1 text-muted-foreground/60 hover:text-muted-foreground")}
          >
            <span>{view.empty.length === 1 ? "1 empty section" : `${view.empty.length} empty sections`}</span>
            <span className="h-px flex-1 bg-sidebar-border/30" />
            <span className={TRAILING_GLYPH_BOX_CLASS}>
              <Icon name="ChevronDown" className={cn("size-3 opacity-60", emptyExpanded && "rotate-180")} />
            </span>
          </button>
          {emptyExpanded ? (
            <ul aria-label="Empty sections" className="flex flex-col gap-px pb-1">
              {view.empty.map(({ section, hint }) => (
                <li key={section.id} className="list-none">
                  <SectionActions section={section}>
                    {(rename, actions) => (
                      <div
                        data-section-drop={section.id}
                        className={cn(
                          "group/empty flex items-center gap-1.5 px-2.5 py-0.5 text-2xs text-muted-foreground/70",
                          dropTarget === section.id && DROP_TARGET_CLASS,
                        )}
                      >
                        <Icon name="Folder" className="size-3 shrink-0 opacity-50" aria-hidden />
                        {rename ?? <span className="min-w-0 truncate">{section.name}</span>}
                        <span className="min-w-0 flex-1 truncate text-muted-foreground/50">{hint}</span>
                        {rename ? null : actions}
                      </div>
                    )}
                  </SectionActions>
                </li>
              ))}
            </ul>
          ) : null}
        </li>
      ) : null}
    </ul>
  );
}

/**
 * Rename and Remove for one section: a context menu on its header, plus
 * hover buttons on empty sections, which have no header to right-click.
 */
function SectionActions({
  section,
  children,
}: {
  section: PluginSidebarSection;
  children: (rename: ReactNode | null, actions: ReactNode) => ReactNode;
}) {
  const sdk = useSdk();
  const portalScope = usePortalScopeProps();
  const [renaming, setRenaming] = useState(false);
  const [removing, setRemoving] = useState(false);
  const renameAfterClose = useRef(false);
  const save = (name: string) => {
    setRenaming(false);
    const trimmed = name.trim();
    if (!trimmed || trimmed === section.name) return;
    void sdk.threadSections.update({ id: section.id, name: trimmed }).catch((error: unknown) => {
      toast.error("Could not rename section", { description: error instanceof Error ? error.message : undefined });
    });
  };
  const rename = renaming ? (
    <input
      autoFocus
      aria-label="Section name"
      defaultValue={section.name}
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Enter") save(event.currentTarget.value);
        if (event.key === "Escape") setRenaming(false);
      }}
      onBlur={(event) => save(event.currentTarget.value)}
      className="min-w-0 flex-1 rounded-sm bg-background px-1 text-2xs font-medium text-foreground outline-none ring-1 ring-ring"
    />
  ) : null;
  const actions = (
    <span className="flex shrink-0 gap-0.5 opacity-0 group-hover/empty:opacity-100 group-focus-within/empty:opacity-100">
      <button
        type="button"
        aria-label={`Rename ${section.name}`}
        title="Rename"
        onClick={() => setRenaming(true)}
        className="rounded-sm p-0.5 hover:bg-sidebar-accent"
      >
        <Icon name="Edit" className="size-3" />
      </button>
      <button
        type="button"
        aria-label={`Remove ${section.name}`}
        title="Remove section"
        onClick={() => setRemoving(true)}
        className="rounded-sm p-0.5 hover:bg-sidebar-accent"
      >
        <Icon name="CircleX" className="size-3" />
      </button>
    </span>
  );
  const itemClass =
    "flex cursor-pointer items-center gap-2 rounded-md px-2 py-[0.3125rem] text-xs outline-none data-[highlighted]:bg-accent";
  return (
    <>
      <ContextMenu.Root>
        <ContextMenu.Trigger asChild>{children(rename, actions)}</ContextMenu.Trigger>
        <ContextMenu.Portal>
          <ContextMenu.Content
            {...portalScope}
            aria-label="Section actions"
            onCloseAutoFocus={(event) => {
              // The editor or the dialog takes focus next.
              if (renameAfterClose.current || removing) event.preventDefault();
              if (!renameAfterClose.current) return;
              renameAfterClose.current = false;
              setRenaming(true);
            }}
            className="z-50 min-w-40 rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-md"
          >
            <ContextMenu.Item className={itemClass} onSelect={() => (renameAfterClose.current = true)}>
              Rename
            </ContextMenu.Item>
            <ContextMenu.Item className={cn(itemClass, "text-destructive-text")} onSelect={() => setRemoving(true)}>
              Remove section…
            </ContextMenu.Item>
          </ContextMenu.Content>
        </ContextMenu.Portal>
      </ContextMenu.Root>
      <RemoveSectionDialog section={section} open={removing} onOpenChange={setRemoving} />
    </>
  );
}

function RemoveSectionDialog({
  section,
  open,
  onOpenChange,
}: {
  section: PluginSidebarSection;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const sdk = useSdk();
  const { threads } = useSidebarThreads();
  const portalScope = usePortalScopeProps();
  const [busy, setBusy] = useState(false);
  const count = threads.filter((thread) => thread.sectionId === section.id && !thread.isArchived).length;
  const submit = async () => {
    setBusy(true);
    try {
      await sdk.threadSections.delete({ id: section.id });
      onOpenChange(false);
    } catch (error) {
      toast.error("Could not remove section", { description: error instanceof Error ? error.message : undefined });
    } finally {
      setBusy(false);
    }
  };
  const buttonClass =
    "h-8 rounded-md px-3 text-xs font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50";
  return (
    <Dialog.Root open={open} onOpenChange={(next) => (next || !busy ? onOpenChange(next) : undefined)}>
      <Dialog.Portal>
        <Dialog.Overlay {...portalScope} className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content
          {...portalScope}
          className="fixed left-1/2 top-1/2 z-50 box-border w-[calc(100%_-_2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-popover p-5 text-popover-foreground shadow-lg outline-none"
        >
          <Dialog.Title className="text-sm font-semibold leading-5">Remove “{section.name}”?</Dialog.Title>
          <Dialog.Description className="mb-4 mt-3 text-xs leading-5 text-muted-foreground">
            {count > 0
              ? `${count === 1 ? "Its 1 thread" : `Its ${count} threads`} will move back to Threads.`
              : "Threads in this section will move back to Threads."}
          </Dialog.Description>
          <div className="flex justify-end gap-2">
            <Dialog.Close asChild>
              <button
                type="button"
                disabled={busy}
                className={cn(buttonClass, "border border-border bg-background hover:bg-accent")}
              >
                Cancel
              </button>
            </Dialog.Close>
            <button
              type="button"
              disabled={busy}
              onClick={() => void submit()}
              className={cn(buttonClass, "bg-destructive text-destructive-foreground hover:opacity-90")}
            >
              {busy ? "Removing…" : "Remove section"}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
