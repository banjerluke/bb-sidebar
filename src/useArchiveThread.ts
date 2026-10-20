import { useRpc, type PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import { useSidebarThreads, useThreadActions } from "./bb-sdk";
import type { bbSidebarRpcContract } from "./contract";
import { canParkThread } from "./lifecycle";

/**
 * bb's bound archive, plus the runtime release it skips.
 *
 * Archive takes the children with it, and bb leaves every idle one's agent
 * session loaded. Release them alongside the archive. Working children are
 * skipped, so this never interrupts a turn archive itself would not.
 */
export function useArchiveThread(thread: PluginSidebarThread): () => void {
  const [archive] = useThreadActions(thread, { keys: ["bb--core/archive"] });
  const { threads } = useSidebarThreads();
  const rpc = useRpc<typeof bbSidebarRpcContract>();
  return () => {
    void archive?.action.run();
    const threadIds = [
      thread.id,
      ...threads.filter((child) => child.parentThreadId === thread.id && canParkThread(child)).map((child) => child.id),
    ];
    void rpc.call("releaseRuntimes", { threadIds }).catch(() => {
      void 0; // A missed release costs memory, not correctness.
    });
  };
}
