import { STORAGE_KEYS } from "./lib/storage-keys";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type PluginSidebarSection, useRealtime, useRpc } from "@get-bb/plugin-sdk/app";
import { toast } from "./lib/toast";
import type { bbSidebarRpcContract } from "./contract";
import { SECTION_ORDER_CHANNEL } from "./realtime-channels";
import { createCachedRpcState } from "./lib/cached-rpc-state";
import { inboxOrderCodec } from "./lib/inbox-order-codec";
import { orderSectionIds } from "./section-groups";

const orderCache = createCachedRpcState(STORAGE_KEYS.sectionOrder.key, inboxOrderCodec);

/** Section ids in the last order this device saw, for menus that only list them. */
export function useSectionOrderIds(sections: readonly PluginSidebarSection[]): string[] {
  const rpc = useRpc<typeof bbSidebarRpcContract>();
  return orderSectionIds(sections, orderCache.read(rpc));
}

/** Durable, optimistic section header order backed by the plugin database. */
export function useSectionOrder(sections: readonly PluginSidebarSection[]) {
  const rpc = useRpc<typeof bbSidebarRpcContract>();
  const [storedIds, setStoredIds] = useState<readonly string[] | null>(() => orderCache.read(rpc));
  const [optimisticIds, setOptimisticIds] = useState<readonly string[] | null>(null);
  const [isReordering, setIsReordering] = useState(false);
  const inFlight = useRef(false);
  const requestSeq = useRef(0);

  const refresh = useCallback(async () => {
    const seq = ++requestSeq.current;
    try {
      const result = await rpc.call("listSectionOrder", {});
      if (seq === requestSeq.current) setStoredIds(orderCache.write(rpc, [...result.sectionIds]));
    } catch {
      // Keep the cached order if a backend reload briefly races this frontend.
    }
  }, [rpc]);

  useEffect(() => {
    void refresh();
    return () => {
      requestSeq.current += 1;
    };
  }, [refresh]);

  useRealtime(SECTION_ORDER_CHANNEL, () => {
    void refresh();
  });

  const ids = useMemo(
    () => orderSectionIds(sections, optimisticIds ?? storedIds),
    [sections, optimisticIds, storedIds],
  );

  const reorder = useCallback(
    async (nextIds: readonly string[]): Promise<boolean> => {
      if (inFlight.current || nextIds.join("\0") === ids.join("\0")) return false;
      inFlight.current = true;
      requestSeq.current += 1;
      setIsReordering(true);
      setOptimisticIds([...nextIds]);
      try {
        // Saving the full current list also drops ids of deleted sections.
        const result = await rpc.call("reorderSections", { sectionIds: [...nextIds] });
        requestSeq.current += 1;
        setStoredIds(orderCache.write(rpc, [...result.sectionIds]));
        return true;
      } catch (error) {
        requestSeq.current += 1;
        void refresh();
        toast.error("Could not reorder sections", {
          description: error instanceof Error ? error.message : undefined,
        });
        return false;
      } finally {
        setOptimisticIds(null);
        inFlight.current = false;
        setIsReordering(false);
      }
    },
    [ids, refresh, rpc],
  );

  return { ids, isReordering, reorder };
}
