import { useCallback, useEffect } from "react";
import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import { STORAGE_KEYS } from "./lib/storage-keys";
import { usePersistedPreference } from "./lib/use-persisted-preference";
import { childExpansionCodec } from "./lib/inbox-preference-codecs";

/** Which parents show their children, persisted and pruned to parents that still have some. */
export function useChildExpansion(childrenByParentId: ReadonlyMap<string, readonly PluginSidebarThread[]>) {
  const [expandedChildParentIds, setExpandedChildParentIds] = usePersistedPreference(
    STORAGE_KEYS.childExpansion.key,
    childExpansionCodec,
  );
  useEffect(() => {
    setExpandedChildParentIds((current) => {
      const next = new Set([...current].filter((threadId) => childrenByParentId.has(threadId)));
      return next.size === current.size ? current : next;
    });
  }, [childrenByParentId]);
  const toggleChildExpansion = useCallback((parentThreadId: string) => {
    setExpandedChildParentIds((current) => {
      const next = new Set(current);
      if (next.has(parentThreadId)) next.delete(parentThreadId);
      else next.add(parentThreadId);
      return next;
    });
  }, []);
  return { expandedChildParentIds, setExpandedChildParentIds, toggleChildExpansion };
}
