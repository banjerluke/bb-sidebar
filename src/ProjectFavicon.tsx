import { useEffect, useState, type ReactNode } from "react";
import { cn } from "./lib/utils";
import { projectMonogramColor, projectMonogramLetter } from "./project-monogram";
import { useProjectColor, useProjectStripeColor, type ProjectStripeView } from "./ProjectColors";
import { useProjectGlyph } from "./ProjectGlyphs";

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
  letters,
}: {
  name: string;
  className?: string;
  projectId?: string;
  /** Characters the user chose instead of the letter drawn from the name; two get a smaller size. */
  letters?: string;
}) {
  const color = useProjectColor(projectId);
  const text = letters ?? projectMonogramLetter(name);
  return (
    <span
      aria-hidden="true"
      data-letter={text}
      style={color}
      className={cn(
        "bb-sidebar-monogram flex size-3.5 shrink-0 items-center justify-center rounded-[3px] font-semibold leading-none",
        [...text].length > 1 ? "text-[6.5px] tracking-tighter" : "text-[8px]",
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
}: {
  projectId: string;
  className?: string;
  view?: ProjectStripeView;
}) {
  const color = useProjectStripeColor(projectId, view);
  if (!color) return null;
  return (
    <span
      aria-hidden="true"
      data-project-stripe=""
      style={color}
      className={cn(
        "bb-sidebar-project-stripe pointer-events-none absolute bottom-1.5 left-0.5 top-1.5 w-0.5 rounded-full",
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
  const glyph = useProjectGlyph(projectId);
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
  // Typed letters or an emoji replace any image.
  if (glyph?.kind === "text") {
    return <ProjectMonogram name={name ?? ""} letters={glyph.text} projectId={projectId} className={className} />;
  }
  if (glyph?.kind === "emoji") {
    return (
      <span
        aria-hidden="true"
        data-glyph={glyph.text}
        className={cn("flex size-3.5 shrink-0 items-center justify-center text-[11px] leading-none", className)}
      >
        {glyph.text}
      </span>
    );
  }
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
