import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRealtime, useRpc } from "@get-bb/plugin-sdk/app";
import type { bbSidebarRpcContract } from "./contract";
import { PROJECT_ICONS_CHANNEL } from "./realtime-channels";
import { parseProjectGlyph, type ProjectGlyph } from "./project-glyph";

const ProjectGlyphsContext = createContext<ReadonlyMap<string, ProjectGlyph>>(new Map());

/** Every project's typed icon, refreshed whenever an icon changes. */
export function ProjectGlyphsProvider({ children }: { children: ReactNode }) {
  const rpc = useRpc<typeof bbSidebarRpcContract>();
  const [raw, setRaw] = useState<Record<string, string>>({});
  const request = useRef(0);
  const load = useCallback(async () => {
    const seq = ++request.current;
    try {
      const result = await rpc.call("listProjectIconGlyphs", {});
      if (seq === request.current) setRaw(result.glyphs);
    } catch {
      // Keep the last glyphs while the backend reloads; the next change retries.
    }
  }, [rpc]);
  useEffect(() => {
    void load();
  }, [load]);
  useRealtime(PROJECT_ICONS_CHANNEL, () => {
    void load();
  });
  const glyphs = useMemo(
    () =>
      new Map(
        Object.entries(raw).flatMap(([projectId, text]) => {
          const glyph = parseProjectGlyph(text);
          return glyph ? [[projectId, glyph] as const] : [];
        }),
      ),
    [raw],
  );
  return <ProjectGlyphsContext.Provider value={glyphs}>{children}</ProjectGlyphsContext.Provider>;
}

export function useProjectGlyph(projectId: string | undefined): ProjectGlyph | null {
  const glyphs = useContext(ProjectGlyphsContext);
  return projectId ? (glyphs.get(projectId) ?? null) : null;
}
