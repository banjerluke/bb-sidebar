import { useSyncExternalStore } from "react";
import { experimental_useSidebarThreads as useSidebarThreads } from "@get-bb/plugin-sdk/app";
import { safeSetItem } from "./lib/safe-storage";
import { SettingRow, SettingsSelect } from "./settings-ui";

export const PORT_LINK_HOST_KEY = "bb-sidebar:port-link-host:v1";
const CHANGE = "bb-sidebar:port-link-host-changed";
function subscribe(listener: () => void) {
  window.addEventListener("storage", listener);
  window.addEventListener(CHANGE, listener);
  return () => {
    window.removeEventListener("storage", listener);
    window.removeEventListener(CHANGE, listener);
  };
}
function readHost() {
  try {
    return window.localStorage.getItem(PORT_LINK_HOST_KEY) || null;
  } catch {
    return null;
  }
}
export function usePortLinkHost() {
  return useSyncExternalStore(subscribe, readHost, () => null);
}
export function PortLinkSettings({ onSaved }: { onSaved?: () => void }) {
  const hostId = usePortLinkHost();
  const { threads } = useSidebarThreads();
  const hosts = new Map(
    threads.flatMap((thread) => (thread.host ? [[thread.host.id, thread.host.name] as const] : [])),
  );
  return (
    <SettingRow
      title="Open port links on"
      description="The machine this browser can reach. Ports on other machines stay as text. Saved only on this device."
      control={
        <SettingsSelect
          aria-label="Open port links on"
          value={hostId ?? ""}
          onChange={(event) => {
            safeSetItem(PORT_LINK_HOST_KEY, event.target.value);
            window.dispatchEvent(new Event(CHANGE));
            onSaved?.();
          }}
          className="w-48"
        >
          <option value="">No machine</option>
          {hostId && !hosts.has(hostId) ? <option value={hostId}>Previously selected machine</option> : null}
          {[...hosts].map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </SettingsSelect>
      }
    />
  );
}
