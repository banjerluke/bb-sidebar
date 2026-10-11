import { useCallback, useEffect, useRef, useState } from "react";
import { useRealtime, useRpc } from "@get-bb/plugin-sdk/app";
import type { bbSidebarRpcContract } from "./contract";
import {
  cachedSidebarSettings,
  cacheSidebarSettings,
  SIDEBAR_SETTINGS_CHANNEL,
  type SidebarSettingsValues,
} from "./sidebar-settings";

/**
 * The saved sidebar settings, read-only, kept current by the realtime channel.
 *
 * A mount and a realtime signal can start overlapping loads. Only the newest
 * one may land: an older answer arriving last would roll the view back to the
 * previous settings and write them over the shared cache.
 *
 * Null until the first load when nothing is cached yet.
 */
export function useSidebarSettings(): SidebarSettingsValues | null {
  const rpc = useRpc<typeof bbSidebarRpcContract>();
  const loadRequestSeq = useRef(0);
  const [settings, setSettings] = useState<SidebarSettingsValues | null>(() => cachedSidebarSettings(rpc));
  const load = useCallback(async () => {
    const seq = ++loadRequestSeq.current;
    try {
      const result = await rpc.call("getSidebarSettings", {});
      if (seq !== loadRequestSeq.current) return;
      setSettings(cacheSidebarSettings(rpc, result));
    } catch {
      void 0; // Older test harnesses and a backend still reloading have no method yet.
    }
  }, [rpc]);
  useEffect(() => {
    void load();
    return () => {
      // An unmounted view drops whatever is still in flight.
      loadRequestSeq.current += 1;
    };
  }, [load]);
  useRealtime(SIDEBAR_SETTINGS_CHANNEL, () => {
    void load();
  });
  return settings;
}
