import { experimental_useThreadActions } from "@get-bb/plugin-sdk/app";
import type { PluginSidebarThread, PluginThreadActionsOptions } from "@get-bb/plugin-sdk/app";

export {
  experimental_useSidebarThreads as useSidebarThreads,
  experimental_useProviders as useProviders,
  experimental_useSidebarThreadSplit as useSidebarThreadSplit,
  experimental_useSidebarThreadPullRequest as useSidebarThreadPullRequest,
  experimental_ThreadStatusGlyph as ThreadStatusGlyph,
} from "@get-bb/plugin-sdk/app";

export function useThreadActions(thread: PluginSidebarThread, options?: PluginThreadActionsOptions) {
  const environment = thread.environment?.id ? { id: thread.environment.id, path: thread.environment.path } : null;
  return experimental_useThreadActions({ ...thread, environment }, options);
}
