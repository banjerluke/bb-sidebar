import type { ThreadReorderControls } from "./ThreadCard";
import { createDragPreview } from "./drag-preview";
import { createDragAutoScroll, findScrollContainer, listenForDrag } from "./drag-auto-scroll";
import { createDragReorderGeometry, type DragReorderOptions } from "./drag-reorder-geometry";

export function createDragReorderHandler({
  key,
  shelf,
  target,
  activeReorderCancelRef,
  dragOrderRef,
  dragPreviewRef,
  listAnimationController,
  suppressDragClick,
  reorderScopeRef,
  sectionDropRef,
  storedOrderUnitsRef,
  setDragOrder,
  commitReorder,
}: DragReorderOptions): ThreadReorderControls["onPointerDown"] {
  return (event) => {
    // Touch has no hover and no spare axis here: the row fills the width, so
    // a finger dragging it is far more likely to mean "scroll the shelf".
    // Reordering by touch needs a long-press to claim the gesture, which
    // this does not implement, so it declines the gesture instead of
    // competing with the scroller for it.
    if (target.isReordering || event.button !== 0 || event.pointerType === "touch") {
      return;
    }

    activeReorderCancelRef.current?.();
    const pointerId = event.pointerId;
    const startX = event.clientX;
    const startY = event.clientY;
    const movingId = key;
    // Captured while the event is still being dispatched, which is the only
    // time `currentTarget` is meaningful.
    const rowAnchor = event.currentTarget;
    let engaged = false;
    let finished = false;
    let previousUserSelect = "";
    let previousCursor = "";
    let listElement: HTMLElement | null = null;
    let scrollContainer: HTMLElement | null = null;
    let pointerX = startX;
    let pointerY = startY;
    const position = { resolvedY: startY, reorderDirection: 0 };
    // Only Active rows can be filed; headers and Pinned rows only reorder.
    const sectionDrop = shelf === "inbox" ? sectionDropRef.current : null;
    let dropTarget: string | null | undefined;
    const trackDropTarget = (clientX: number, clientY: number) => {
      if (!sectionDrop) return false;
      const next = sectionDrop.targetAt(document.elementFromPoint(clientX, clientY), movingId);
      if (next !== dropTarget) {
        dropTarget = next;
        sectionDrop.setTarget(next);
      }
      return next !== undefined;
    };
    const reorderAt = createDragReorderGeometry(
      { shelf, key, dragOrderRef, reorderScopeRef, storedOrderUnitsRef, dragPreviewRef, setDragOrder },
      () => ({ scrollContainer, listElement }),
      position,
    );
    const autoScroll = createDragAutoScroll(
      () => ({ finished, engaged, scrollContainer, pointerX, pointerY }),
      reorderAt,
    );

    function cleanup() {
      removeListeners();
      autoScroll.stop();
      if (engaged) {
        document.body.style.userSelect = previousUserSelect;
        document.body.style.cursor = previousCursor;
        dragPreviewRef.current?.destroy();
        dragPreviewRef.current = null;
        listAnimationController.resume();
      }
      if (activeReorderCancelRef.current === cancel) {
        activeReorderCancelRef.current = null;
      }
      if (dropTarget !== undefined) sectionDrop?.setTarget(undefined);
    }

    function cancel() {
      if (finished) return;
      finished = true;
      cleanup();
      if (engaged) {
        dragOrderRef.current = null;
        setDragOrder(null);
      }
    }

    function engage() {
      engaged = true;
      previousUserSelect = document.body.style.userSelect;
      previousCursor = document.body.style.cursor;
      document.body.style.userSelect = "none";
      document.body.style.cursor = "grabbing";
      listAnimationController.suspend();
      suppressDragClick(movingId);
      listElement = rowAnchor.closest("ul");
      scrollContainer = findScrollContainer(listElement);
      position.resolvedY = startY + (scrollContainer?.scrollTop ?? 0);
      if (listElement) dragPreviewRef.current = createDragPreview(listElement);
      const next = {
        shelf,
        movingId,
        ...reorderScopeRef.current(movingId, shelf),
      };
      dragOrderRef.current = next;
      setDragOrder(next);
      autoScroll.start();
    }

    function onPointerMove(moveEvent: PointerEvent) {
      if (finished || moveEvent.pointerId !== pointerId) return;
      // A button let go outside the window never delivers its pointerup.
      if ((moveEvent.buttons & 1) === 0) {
        cancel();
        return;
      }
      pointerX = moveEvent.clientX;
      pointerY = moveEvent.clientY;
      if (!engaged) {
        const deltaX = moveEvent.clientX - startX;
        const deltaY = moveEvent.clientY - startY;
        // Radial distance, but still vertical-dominant: a sideways gesture
        // belongs to the host's drag-to-split, not to reordering.
        if (Math.hypot(deltaX, deltaY) < 6 || Math.abs(deltaY) <= Math.abs(deltaX)) {
          return;
        }
        engage();
      }
      moveEvent.preventDefault();
      if (!trackDropTarget(moveEvent.clientX, moveEvent.clientY)) reorderAt(moveEvent.clientX, moveEvent.clientY);
    }

    function onPointerUp(upEvent: PointerEvent) {
      if (finished || upEvent.pointerId !== pointerId) return;
      // Auto-scroll and host updates both move the list under a pointer
      // that never moved again, so the last pointermove is not necessarily
      // the last word on where this row belongs.
      const filing = engaged && trackDropTarget(upEvent.clientX, upEvent.clientY);
      if (engaged && !filing) reorderAt(upEvent.clientX, upEvent.clientY);
      const current = dragOrderRef.current;
      const target = dropTarget;
      finished = true;
      cleanup();
      if (!engaged || !current || current.shelf !== shelf) return;

      dragOrderRef.current = null;
      setDragOrder(null);
      if (filing && target !== undefined) {
        sectionDrop?.drop(movingId, target);
        return;
      }
      commitReorder(shelf, current.mode, current.ids, current.movingId, current.parentKey);
    }

    function onPointerCancel(cancelEvent: PointerEvent) {
      if (cancelEvent.pointerId === pointerId) cancel();
    }

    function onKeyDown(keyEvent: KeyboardEvent) {
      if (keyEvent.key === "Escape") cancel();
    }

    function onVisibilityChange() {
      if (document.visibilityState === "hidden") cancel();
    }

    const removeListeners = listenForDrag({
      onPointerMove,
      onPointerUp,
      onPointerCancel,
      onKeyDown,
      cancel,
      onVisibilityChange,
    });
    activeReorderCancelRef.current = cancel;
  };
}
