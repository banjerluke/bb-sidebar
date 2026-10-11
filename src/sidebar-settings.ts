import { createCachedRpcState } from "./lib/cached-rpc-state";
import { currentSettingsOnly, decodeSettingsCache } from "./lib/settings-cache-codec";
import { STORAGE_KEYS } from "./lib/storage-keys";
import type { SidebarSettingsValues } from "./sidebar-settings-values";
export * from "./sidebar-settings-values";

const settingsCache = createCachedRpcState<SidebarSettingsValues>(
  STORAGE_KEYS.settings.key,
  {
    decode: (stored) => (stored ? decodeSettingsCache(JSON.parse(stored)) : null),
    encode: JSON.stringify,
  },
  { rememberStoredReads: true },
);

export function cachedSidebarSettings(rpcClient: object): SidebarSettingsValues | null {
  return settingsCache.read(rpcClient);
}

export function cacheSidebarSettings(rpcClient: object, values: SidebarSettingsValues): SidebarSettingsValues {
  return settingsCache.write(rpcClient, currentSettingsOnly(values));
}
