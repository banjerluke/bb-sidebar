import { useEffect, useRef, type RefObject } from "react";

/**
 * Swallow the click a finished drag would otherwise fire on the row it started
 * from. Armed the moment a drag engages rather than when it drops, so drop,
 * Escape and a blurred window are all covered by the same listener.
 *
 * It disarms after one swallowed click, and on the next pointer press either
 * way. Staying armed would eat the click that Enter raises on the same row —
 * that click has no pointer press in front of it to clear the trap.
 *
 * Returns its own disarm so the caller can drop it on unmount.
 */
function armClickSuppression(key: string): () => void {
  const disarm = () => {
    window.removeEventListener("click", suppress, true);
    window.removeEventListener("pointerdown", disarm, true);
  };
  function suppress(event: MouseEvent) {
    const clicked =
      event.target instanceof Element
        ? (event.target.closest("[data-reorder-key]")?.getAttribute("data-reorder-key") ??
          event.target.closest("[data-sidebar-thread-id]")?.getAttribute("data-sidebar-thread-id"))
        : null;
    if (clicked !== key) return;
    event.preventDefault();
    event.stopPropagation();
    disarm();
  }
  window.addEventListener("click", suppress, true);
  window.addEventListener("pointerdown", disarm, true);
  return disarm;
}

/** Nearest ancestor that actually scrolls, so a drag can reach past the fold. */
export function findScrollContainer(from: Element | null): HTMLElement | null {
  for (let node = from?.parentElement ?? null; node; node = node.parentElement) {
    const overflowY = window.getComputedStyle(node).overflowY;
    if (
      (overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay") &&
      node.scrollHeight > node.clientHeight
    ) {
      return node;
    }
  }
  return null;
}

/** How close to an edge a drag must come before the shelf starts scrolling. */
const DRAG_SCROLL_EDGE = 48;
/** Pixels per frame at the very edge, ramping down to nothing at the hot zone. */
const DRAG_SCROLL_SPEED = 14;

interface DragScrollState {
  finished: boolean;
  engaged: boolean;
  scrollContainer: HTMLElement | null;
  pointerX: number;
  pointerY: number;
}

export function createDragAutoScroll(readState: () => DragScrollState, reorderAt: (x: number, y: number) => void) {
  let scrollFrame = 0;
  function onScrollFrame() {
    const { finished, engaged, scrollContainer, pointerX, pointerY } = readState();
    scrollFrame = 0;
    if (finished || !engaged) return;
    if (scrollContainer) {
      const rect = scrollContainer.getBoundingClientRect();
      const fromTop = pointerY - rect.top;
      const fromBottom = rect.bottom - pointerY;
      // A pointer dragged off to the side has left the shelf; it should
      // not keep driving it.
      const within = pointerX >= rect.left && pointerX <= rect.right;
      const delta = !within
        ? 0
        : fromTop < DRAG_SCROLL_EDGE
          ? -DRAG_SCROLL_SPEED * (1 - Math.max(fromTop, 0) / DRAG_SCROLL_EDGE)
          : fromBottom < DRAG_SCROLL_EDGE
            ? DRAG_SCROLL_SPEED * (1 - Math.max(fromBottom, 0) / DRAG_SCROLL_EDGE)
            : 0;
      if (delta !== 0) {
        const scrollTop = scrollContainer.scrollTop;
        scrollContainer.scrollTop = scrollTop + delta;
        // Only re-resolve when the view actually moved, so a drag parked
        // against an end does not churn state every frame. A host update
        // can still shift rows without the scroll position changing;
        // the next pointermove or the drop picks that up.
        if (scrollContainer.scrollTop !== scrollTop) {
          reorderAt(pointerX, pointerY);
        }
      }
    }
    scrollFrame = window.requestAnimationFrame(onScrollFrame);
  }

  return {
    start() {
      scrollFrame = window.requestAnimationFrame(onScrollFrame);
    },
    stop() {
      if (scrollFrame !== 0) {
        window.cancelAnimationFrame(scrollFrame);
        scrollFrame = 0;
      }
    },
  };
}

export function useDragAutoScroll(activeReorderCancelRef: RefObject<(() => void) | null>) {
  const clickSuppressionRef = useRef<(() => void) | null>(null);
  useEffect(
    () => () => {
      activeReorderCancelRef.current?.();
      // Suppression outlives the gesture on purpose, but not the component.
      clickSuppressionRef.current?.();
    },
    [],
  );
  return (key: string) => {
    clickSuppressionRef.current?.();
    clickSuppressionRef.current = armClickSuppression(key);
  };
}
