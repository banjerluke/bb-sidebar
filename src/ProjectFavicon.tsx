import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { cn } from "./lib/utils";
import { projectMonogramColor, projectMonogramLetter } from "./project-monogram";
import { useProjectColor, useProjectStripeColor, type ProjectStripeView } from "./ProjectColors";

// Keyed by the icon route URL. A loaded entry holds the attempt URL that
// succeeded. A failure is retried with backoff instead of blocking the icon
// until reload: the first request can fail while bb's host is still starting.
const loadedSources = new Map<string, string>();
const failedSources = new Map<string, { count: number; retryAt: number }>();
const RETRY_BASE_MS = 15_000;
const RETRY_MAX_MS = 10 * 60_000;

/** Test isolation after all mounted consumers have been cleaned up. */
export function resetProjectFaviconsForTests() {
  loadedSources.clear();
  failedSources.clear();
}

function attemptUrl(src: string, attempt: number): string {
  if (attempt === 0) return src;
  return `${src}${src.includes("?") ? "&" : "?"}attempt=${attempt}`;
}

function recordFailure(src: string, attempt: number): void {
  // Every row showing this project sees the same failed request; count it once.
  if ((failedSources.get(src)?.count ?? 0) !== attempt) return;
  const count = attempt + 1;
  failedSources.set(src, {
    count,
    retryAt: Date.now() + Math.min(RETRY_BASE_MS * 2 ** (count - 1), RETRY_MAX_MS),
  });
}

/**
 * A letter on a stable colour, for a project with no icon (or one still
 * loading). One letter: two would be about five pixels wide each at row size.
 * CSS draws the letter from `data-letter`, so like the icon it stands in for
 * it stays out of the row's text, copy, and find-in-page.
 */
export function ProjectMonogram({
  name,
  className,
  projectId,
}: {
  name: string;
  className?: string;
  projectId?: string;
}) {
  const color = useProjectColor(projectId);
  return (
    <span
      aria-hidden="true"
      data-letter={projectMonogramLetter(name)}
      style={color}
      className={cn(
        "bb-sidebar-monogram flex size-3.5 shrink-0 items-center justify-center rounded-[3px] text-[8px] font-semibold leading-none",
        color ? "bb-sidebar-project-monogram" : `bb-sidebar-monogram-${projectMonogramColor(name)}`,
        className,
      )}
    />
  );
}

/**
 * A thin soft bar on a row's left edge in the project's colour, so threads of
 * one project read as a group even when the project has its own icon. The row
 * must be `relative`.
 */
export function ProjectStripe({
  projectId,
  className,
  view,
  unread = false,
  inGroup = false,
}: {
  projectId: string;
  className?: string;
  view?: ProjectStripeView;
  /**
   * An unread row always gets a wide, solid stripe, in the project colour when
   * colours are on and a muted grey otherwise. A read row keeps the thin one
   * the stripe setting allows, faded, so a glance down the edge finds what is new.
   */
  unread?: boolean;
  /** Inside a project group, whose own stripe stands for its read rows. */
  inGroup?: boolean;
}) {
  const stripeColor = useProjectStripeColor(projectId, view);
  const projectColor = useProjectColor(projectId);
  const color = unread
    ? (projectColor ?? ({ "--bb-sidebar-project": "var(--muted-foreground)" } as CSSProperties))
    : stripeColor;
  if (!color || (inGroup && !unread)) return null;
  return (
    <span
      aria-hidden="true"
      data-project-stripe=""
      data-unread={unread ? "" : undefined}
      style={color}
      className={cn(
        "bb-sidebar-project-stripe pointer-events-none absolute bottom-1.5 top-1.5 rounded-full",
        unread ? "left-0.5 w-[3px]" : "left-[3px] w-px opacity-60",
        className,
      )}
    />
  );
}

export function ProjectFavicon({
  src,
  name,
  className,
  fallback,
  projectId,
}: {
  src: string | null;
  /** The project's name; without an explicit fallback, draws its letter tile. */
  name?: string | null;
  className?: string;
  fallback?: ReactNode;
  projectId?: string;
}) {
  if (fallback === undefined) {
    fallback = name ? <ProjectMonogram name={name} projectId={projectId} className={className} /> : null;
  }
  const [, setRenderCount] = useState(0);
  const rerender = () => setRenderCount((count) => count + 1);
  const failure = src ? failedSources.get(src) : undefined;
  const retryAt = failure && failure.retryAt > Date.now() ? failure.retryAt : null;
  useEffect(() => {
    if (retryAt === null) return;
    const timer = setTimeout(rerender, retryAt - Date.now());
    return () => clearTimeout(timer);
  }, [src, retryAt]);
  if (!src || retryAt !== null) return fallback;

  const loadedUrl = loadedSources.get(src);
  if (loadedUrl) {
    return (
      <img
        src={loadedUrl}
        alt=""
        className={cn("size-3.5 shrink-0 rounded-sm object-contain", className)}
        onError={() => {
          loadedSources.delete(src);
          recordFailure(src, 0);
          rerender();
        }}
      />
    );
  }

  const attempt = failure?.count ?? 0;
  const url = attemptUrl(src, attempt);
  return (
    <span aria-hidden="true" className={cn("size-3.5 shrink-0", className)}>
      {fallback}
      <img
        src={url}
        alt=""
        className="hidden"
        onLoad={() => {
          failedSources.delete(src);
          loadedSources.set(src, url);
          rerender();
        }}
        onError={() => {
          recordFailure(src, attempt);
          rerender();
        }}
      />
    </span>
  );
}
