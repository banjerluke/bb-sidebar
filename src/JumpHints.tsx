import { createContext, useContext, useEffect, useState, type RefObject } from "react";
import { cn } from "./lib/utils";

// bb binds thread.jump.1–9 to Mod+digit and resolves them by walking these
// anchors in document order, so numbering them the same way here keeps each
// hint on the row its shortcut opens.
const TARGET_SELECTOR = "[data-sidebar-thread-shortcut-target]";
const JUMP_COUNT = 9;

// bb's own hold delay, so these appear together with the host's hints.
const HOLD_DELAY_MS = 700;

// bb's keyboard hint pill, class for class, so these read as the host's.
const HINT_CLASS =
  "pointer-events-none inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-sm bg-state-hover px-1.5 py-1 font-sans text-xs font-normal leading-none tabular-nums text-subtle-foreground opacity-60";

type JumpHints = ReadonlyMap<string, string>;

const NO_HINTS: JumpHints = new Map();

export const JumpHintsContext = createContext<JumpHints>(NO_HINTS);

function isMacPlatform(): boolean {
  return /Mac|iPhone|iPad/.test(navigator.platform);
}

function jumpLabel(position: number, isMac: boolean): string {
  return isMac ? `⌘ ${position}` : `Ctrl + ${position}`;
}

/**
 * Label the first nine rows under `rootRef` while the shortcut modifier is
 * held, the way bb labels its own rows: Control, or Command on a Mac, held
 * alone for a moment. Any other key, including the jump itself, clears them.
 */
export function useJumpHints(rootRef: RefObject<HTMLElement | null>): JumpHints {
  const [hints, setHints] = useState<JumpHints>(NO_HINTS);

  useEffect(() => {
    const isMac = isMacPlatform();
    let timer: number | undefined;
    let shown = false;

    const isModifier = (key: string) => key === "Control" || (isMac && key === "Meta");

    function show() {
      timer = undefined;
      const root = rootRef.current;
      if (!root) return;
      shown = true;
      const next = new Map<string, string>();
      for (const target of root.querySelectorAll<HTMLElement>(TARGET_SELECTOR)) {
        const threadId = target.dataset.sidebarThreadId;
        if (!threadId) continue;
        next.set(threadId, jumpLabel(next.size + 1, isMac));
        if (next.size === JUMP_COUNT) break;
      }
      setHints(next);
    }

    function hide() {
      window.clearTimeout(timer);
      timer = undefined;
      if (!shown) return;
      shown = false;
      setHints(NO_HINTS);
    }

    function onKeyDown(event: KeyboardEvent) {
      if (!isModifier(event.key)) {
        hide();
        return;
      }
      if (shown || timer !== undefined) return;
      const otherModifier = event.key === "Meta" ? event.ctrlKey : event.metaKey;
      if (event.shiftKey || event.altKey || otherModifier) {
        hide();
        return;
      }
      timer = window.setTimeout(show, HOLD_DELAY_MS);
    }

    function onKeyUp(event: KeyboardEvent) {
      if (isModifier(event.key)) hide();
    }

    // Cmd+Tab away swallows the keyup, so leaving the window also clears.
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("keyup", onKeyUp, true);
    window.addEventListener("blur", hide);
    return () => {
      hide();
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("keyup", onKeyUp, true);
      window.removeEventListener("blur", hide);
    };
  }, [rootRef]);

  return hints;
}

/** This row's jump shortcut while the modifier is held, else null. */
export function useJumpHint(threadId: string): string | null {
  return useContext(JumpHintsContext).get(threadId) ?? null;
}

export function JumpHint({ label, className }: { label: string; className?: string }) {
  return (
    <kbd aria-hidden="true" className={cn(HINT_CLASS, className)}>
      {label}
    </kbd>
  );
}
