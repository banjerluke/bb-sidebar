import { useLayoutEffect, type RefObject } from "react";

/**
 * Keeps keyboard focus on a row that moves. Moving a row between shelf trees
 * unmounts it, and with it the focused link, child row, or control; this puts
 * focus back on the same element of the row's replacement.
 */
export function useRestoreRowFocus(row: RefObject<HTMLLIElement | null>, threadId: string) {
  useLayoutEffect(() => {
    return () => {
      const focused = document.activeElement;
      if (!(focused instanceof HTMLElement) || !row.current?.contains(focused)) return;
      const sidebar = row.current.closest<HTMLElement>("[data-bb-sidebar-root]");
      const childId = focused.getAttribute("data-child-thread-id");
      const control = focused.getAttribute("data-thread-control");
      // Moving a row between shelf trees unmounts its focused control.
      queueMicrotask(() => {
        if (!sidebar?.isConnected || document.activeElement !== document.body) return;
        const replacement = [...sidebar.querySelectorAll<HTMLAnchorElement>("a[data-sidebar-thread-id]")].find(
          (link) => link.dataset.sidebarThreadId === threadId,
        );
        const replacementRow = replacement?.closest("li");
        const child =
          childId &&
          [...(replacementRow?.querySelectorAll<HTMLElement>("[data-child-thread-id]") ?? [])].find(
            (item) => item.dataset.childThreadId === childId,
          );
        const matchingControl =
          control &&
          [...(replacementRow?.querySelectorAll<HTMLElement>("[data-thread-control]") ?? [])].find(
            (item) => item.dataset.threadControl === control,
          );
        (child || matchingControl || replacement)?.focus();
      });
    };
  }, [row, threadId]);
}
