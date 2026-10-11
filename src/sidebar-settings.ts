import { safeSetItem } from "./lib/safe-storage";
import {
  childThreadSettingsOf,
  DEFAULT_SIDEBAR_SETTINGS,
  projectColorDisplayOf,
  type SidebarSettingsValues,
} from "./sidebar-settings-values";
export * from "./sidebar-settings-values";
export { SIDEBAR_SETTINGS_CHANNEL } from "./realtime-channels";

const SIDEBAR_SETTINGS_CACHE_KEY = "bb-sidebar:settings-cache:v1";
const settingsByRpcClient = new WeakMap<object, SidebarSettingsValues>();

// Old previews may have cached removed settings. Never forward unknown keys
// from storage (or an older server response) to the strict settings RPC.
function currentSettingsOnly(value: SidebarSettingsValues): SidebarSettingsValues {
  return Object.fromEntries(
    Object.keys(DEFAULT_SIDEBAR_SETTINGS).map((key) => [
      key,
      value[key as keyof SidebarSettingsValues] ?? DEFAULT_SIDEBAR_SETTINGS[key as keyof SidebarSettingsValues],
    ]),
  ) as unknown as SidebarSettingsValues;
}

function readStoredSidebarSettings(): SidebarSettingsValues | null {
  try {
    const stored = window.localStorage.getItem(SIDEBAR_SETTINGS_CACHE_KEY);
    if (!stored) return null;
    const value = JSON.parse(stored) as Partial<SidebarSettingsValues>;
    if (
      typeof value.snoozePresets !== "string" ||
      typeof value.inactiveThreadsEnabled !== "boolean" ||
      typeof value.inactiveAfterHours !== "number" ||
      typeof value.showRunningChildrenWhenCollapsed !== "boolean" ||
      typeof value.autoSettleInactive !== "boolean" ||
      typeof value.autoSettleAfterDays !== "number" ||
      typeof value.autoSettleOnMerge !== "boolean"
    ) {
      return null;
    }
    // A cache written before the child-thread settings existed lacks them.
    // It is still good for everything else, so fill the gaps with defaults
    // instead of dropping it and flashing the old settings until the load.
    return currentSettingsOnly({
      ...value,
      ...childThreadSettingsOf(value),
      compactWorkingThreads: value.compactWorkingThreads === true,
      workingShelf: value.workingShelf === true,
      dockShelves: value.dockShelves === true,
      projectColorsEnabled: value.projectColorsEnabled === true,
      projectColorDisplay: projectColorDisplayOf(value.projectColorDisplay),
    } as SidebarSettingsValues);
  } catch {
    return null;
  }
}

export function cachedSidebarSettings(rpcClient: object): SidebarSettingsValues | null {
  const cached = settingsByRpcClient.get(rpcClient);
  if (cached) return cached;
  const stored = readStoredSidebarSettings();
  if (stored) settingsByRpcClient.set(rpcClient, stored);
  return stored;
}

export function cacheSidebarSettings(rpcClient: object, values: SidebarSettingsValues): SidebarSettingsValues {
  values = currentSettingsOnly(values);
  settingsByRpcClient.set(rpcClient, values);
  safeSetItem(SIDEBAR_SETTINGS_CACHE_KEY, JSON.stringify(values));
  return values;
}
