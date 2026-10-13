import { createContext, useMemo, type ReactNode, type Dispatch, type SetStateAction } from "react";
import type { PluginSidebarThread, useBbNavigate } from "@get-bb/plugin-sdk/app";
import type { useSidebarThreads } from "./bb-sdk";
import type { SidebarProvider } from "./ProviderGlyph";
import type { SidebarSettingsValues } from "./sidebar-settings";
import type { ConfiguredSnoozePreset } from "./lifecycle";
import type { LifecycleApi } from "./useLifecycle";
import type { ShelfExpansionState } from "./ThreadInboxView";
import type { ActiveSortMode } from "./inbox-layout";
import type { useRenamingShelfLocks } from "./useRenamingShelfLocks";

interface InboxContextInputs {
  providerById: ReadonlyMap<string, SidebarProvider>;
  projectNameById: ReadonlyMap<string, string>;
  projectIconRevision: number;
  projects: ReturnType<typeof useSidebarThreads>["projects"];
  sidebarSettings: SidebarSettingsValues | null;
  snoozePresets: readonly ConfiguredSnoozePreset[];
  lifecycle: LifecycleApi;
  childrenByParentId: ReadonlyMap<string, readonly PluginSidebarThread[]>;
  activeThreadId: string | null;
  now: number;
  navigate: ReturnType<typeof useBbNavigate>;
  onNavigate: () => void;
  parkThread: (thread: PluginSidebarThread) => void;
  settleThread: (thread: PluginSidebarThread) => void;
  snoozeThread: (thread: PluginSidebarThread, until: number) => void;
  toggleChildExpansion: (threadId: string) => void;
  setRenamingShelfLocks: ReturnType<typeof useRenamingShelfLocks>[1];
  setScope: Dispatch<SetStateAction<string>>;
  setExpandedShelves: Dispatch<SetStateAction<ShelfExpansionState>>;
  setActiveSortMode: Dispatch<SetStateAction<ActiveSortMode>>;
  setSettledLimit: Dispatch<SetStateAction<number>>;
  toggleProjectCollapse: (projectId: string) => void;
}

/** Shared inbox values have separate identities for data, handlers, and activity. */
export function useInboxContextValues({
  providerById,
  projectNameById,
  projectIconRevision,
  projects,
  sidebarSettings,
  snoozePresets,
  lifecycle,
  childrenByParentId,
  activeThreadId,
  now,
  navigate,
  onNavigate,
  parkThread,
  settleThread,
  snoozeThread,
  toggleChildExpansion,
  setRenamingShelfLocks,
  setScope,
  setExpandedShelves,
  setActiveSortMode,
  setSettledLimit,
  toggleProjectCollapse,
}: InboxContextInputs) {
  const environment = useMemo(
    () => ({
      providerById,
      projectNameById,
      projectIconRevision,
      projects,
      sidebarSettings,
      snoozePresets,
      lifecycle,
      childrenByParentId,
    }),
    [
      providerById,
      projectNameById,
      projectIconRevision,
      projects,
      sidebarSettings,
      snoozePresets,
      lifecycle,
      childrenByParentId,
    ],
  );
  const actions = useMemo(
    () => ({
      navigate,
      onNavigate,
      parkThread,
      settleThread,
      snoozeThread,
      toggleChildExpansion,
      setRenamingShelfLocks,
      setScope,
      setExpandedShelves,
      setActiveSortMode,
      setSettledLimit,
      toggleProjectCollapse,
    }),
    [
      navigate,
      onNavigate,
      parkThread,
      settleThread,
      snoozeThread,
      toggleChildExpansion,
      setRenamingShelfLocks,
      setScope,
      setExpandedShelves,
      setActiveSortMode,
      setSettledLimit,
      toggleProjectCollapse,
    ],
  );
  const activity = useMemo(() => ({ activeThreadId, now }), [activeThreadId, now]);
  return { environment, actions, activity };
}

type InboxValues = ReturnType<typeof useInboxContextValues>;
const InboxEnvironmentContext = createContext<InboxValues["environment"] | null>(null);
const InboxActionsContext = createContext<InboxValues["actions"] | null>(null);
const InboxActivityContext = createContext<InboxValues["activity"] | null>(null);

export function InboxProvider({ value, children }: { value: InboxValues; children: ReactNode }) {
  return (
    <InboxEnvironmentContext.Provider value={value.environment}>
      <InboxActionsContext.Provider value={value.actions}>
        <InboxActivityContext.Provider value={value.activity}>{children}</InboxActivityContext.Provider>
      </InboxActionsContext.Provider>
    </InboxEnvironmentContext.Provider>
  );
}
