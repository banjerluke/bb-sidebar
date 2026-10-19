const timing = { duration: 150, easing: "ease-out" };
const MAX_CHANGED_ROWS = 40;

type Position = { top: number; left: number };
type List = { positions: Map<HTMLElement, Position> };

/** One geometry pass per inbox commit, followed by transform/opacity writes.
 * Removed rows stay removed: no detached React trees are put back into the DOM.
 */
export function createListAnimationController(enabled = true) {
  const lists = new Map<HTMLElement, List>();
  const running = new Map<HTMLElement, { animation: Animation; top: number; left: number }>();
  let observer: MutationObserver | undefined;
  let frame: number | undefined;
  let holds = 0;
  let animateNext = true;

  const read = (parent: HTMLElement) =>
    new Map(
      Array.from(parent.children)
        .filter((node): node is HTMLElement => node instanceof HTMLElement)
        .map((node) => [node, { top: node.offsetTop, left: node.offsetLeft }]),
    );
  const cancel = () => {
    for (const { animation } of running.values()) animation.cancel();
    running.clear();
  };
  const update = () => {
    frame = undefined;
    // Read all lists before starting any animation. Offsets exclude our transforms.
    const snapshots = [...lists].map(([parent, list]) => ({ list, next: read(parent) }));
    let changed = 0;
    for (const { list, next } of snapshots) {
      for (const node of list.positions.keys()) if (!next.has(node)) changed++;
      for (const node of next.keys()) if (!list.positions.has(node)) changed++;
    }
    const animate =
      animateNext &&
      holds === 0 &&
      changed <= MAX_CHANGED_ROWS &&
      !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    animateNext = true;
    // Carry a running translation forward when a second toggle interrupts it.
    const offsets = new Map<HTMLElement, Position>();
    if (animate) {
      for (const [node, { animation, top, left }] of running) {
        const progress = Number(animation.effect?.getComputedTiming().progress ?? 1);
        offsets.set(node, { top: top * (1 - progress), left: left * (1 - progress) });
      }
    }
    cancel();
    for (const { list, next } of snapshots) {
      if (animate) {
        for (const [node, position] of next) {
          const previous = list.positions.get(node);
          const offset = offsets.get(node);
          const top = previous ? previous.top - position.top + (offset?.top ?? 0) : -4;
          const left = previous ? previous.left - position.left + (offset?.left ?? 0) : 0;
          if (previous && top === 0 && left === 0) continue;
          const animation = node.animate(
            [
              { transform: `translate(${left}px, ${top}px)`, opacity: previous ? 1 : 0 },
              { transform: "translate(0, 0)", opacity: 1 },
            ],
            timing,
          );
          running.set(node, { animation, top, left });
          animation.addEventListener(
            "finish",
            () => {
              if (running.get(node)?.animation === animation) running.delete(node);
            },
            { once: true },
          );
        }
      }
      list.positions = next;
    }
  };
  const schedule = (animate: boolean) => {
    animateNext &&= animate;
    frame ??= requestAnimationFrame(update);
  };
  return {
    enabled,
    suspend() {
      holds++;
      cancel();
      if (frame !== undefined) cancelAnimationFrame(frame);
      frame = undefined;
    },
    resume() {
      if (holds === 0) return;
      if (--holds === 0 && lists.size > 0) schedule(false);
    },
    register(parent: HTMLElement) {
      const positionStyle = parent.style.position;
      if (getComputedStyle(parent).position === "static") parent.style.position = "relative";
      lists.set(parent, { positions: read(parent) });
      observer ??= new MutationObserver(() => {
        if (holds === 0) schedule(true);
      });
      observer.observe(parent, { childList: true });
      return () => {
        lists.delete(parent);
        parent.style.position = positionStyle;
        for (const [node, { animation }] of running) {
          if (parent.contains(node) || !node.isConnected) {
            animation.cancel();
            running.delete(node);
          }
        }
        observer?.disconnect();
        for (const node of lists.keys()) observer?.observe(node, { childList: true });
        if (lists.size === 0 && frame !== undefined) {
          cancelAnimationFrame(frame);
          frame = undefined;
        }
      };
    },
  };
}
