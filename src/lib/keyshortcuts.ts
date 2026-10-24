const REORDER_KEYSHORTCUTS = "Alt+ArrowUp Alt+ArrowDown";

/** A row's `aria-keyshortcuts`: bb's jump key while it is assigned, plus the reorder keys. */
export function rowKeyshortcuts(jumpKeys: string | undefined, reorderable: boolean): string | undefined {
  return [jumpKeys, reorderable ? REORDER_KEYSHORTCUTS : null].filter(Boolean).join(" ") || undefined;
}
