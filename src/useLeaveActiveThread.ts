import { useCallback, type RefObject } from "react";
import type { BbNavigate, PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import type { useLifecycle } from "./useLifecycle";

/**
 * Park, settle, and snooze, moving on to the next listed thread when the one
 * being put away is open.
 */
export function useLeaveActiveThread({
  lifecycle,
  navigate,
  onNavigate,
  activeThreadIdRef,
  nextThreadCandidatesRef,
}: {
  lifecycle: ReturnType<typeof useLifecycle>;
  navigate: BbNavigate;
  onNavigate: () => void;
  activeThreadIdRef: RefObject<string | null>;
  nextThreadCandidatesRef: RefObject<readonly PluginSidebarThread[]>;
}) {
  const parkActiveThread = useCallback(
    async (thread: PluginSidebarThread, mutation: () => Promise<boolean>) => {
      const parked = await mutation();
      if (!parked || activeThreadIdRef.current !== thread.id) return;

      // Read the latest list after the request, since another client may
      // have moved or reordered the first candidate while it was pending.
      const nextThread = nextThreadCandidatesRef.current.find((candidate) => candidate.id !== thread.id);
      if (nextThread) {
        navigate.toThread(nextThread.id);
      } else {
        navigate.toCompose({
          projectId: thread.projectId,
          focusPrompt: true,
        });
      }
      onNavigate();
    },
    [navigate, onNavigate],
  );

  const parkThread = useCallback(
    (thread: PluginSidebarThread) => void parkActiveThread(thread, () => lifecycle.park(thread.id)),
    [parkActiveThread, lifecycle],
  );
  const settleThread = useCallback(
    (thread: PluginSidebarThread) => void parkActiveThread(thread, () => lifecycle.settle(thread.id)),
    [parkActiveThread, lifecycle],
  );
  const snoozeThread = useCallback(
    (thread: PluginSidebarThread, until: number) =>
      void parkActiveThread(thread, () => lifecycle.snooze(thread.id, until)),
    [parkActiveThread, lifecycle],
  );
  return { parkThread, settleThread, snoozeThread };
}
