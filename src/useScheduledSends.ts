import { useEffect, useMemo, useState } from "react";
import { useSdk, type PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import { scheduledSendTimes } from "./lifecycle";

const NO_SENDS: ReadonlyMap<string, number> = new Map();

/**
 * When each thread whose queued messages are all scheduled will send.
 *
 * The sidebar view says only that a message waits, not when, so this reads
 * bb's queue. A send, cancel, or new scheduled thread changes which threads
 * have queued work, which refetches; nothing polls.
 */
export function useScheduledSends(threads: readonly PluginSidebarThread[]): ReadonlyMap<string, number> {
  const sdk = useSdk();
  const [sendAts, setSendAts] = useState(NO_SENDS);
  const waitingKey = useMemo(
    () =>
      threads
        .filter((thread) => thread.queuedWork === "waiting")
        .map((thread) => thread.id)
        .sort()
        .join(","),
    [threads],
  );

  useEffect(() => {
    if (waitingKey === "") {
      setSendAts(NO_SENDS);
      return;
    }
    let current = true;
    void (async () => {
      try {
        const rows = await sdk.threads.queue.list();
        if (current) setSendAts(scheduledSendTimes(rows));
      } catch {
        void 0; // An older host or a transient failure keeps the last known times.
      }
    })();
    return () => {
      current = false;
    };
  }, [sdk, waitingKey]);

  return sendAts;
}
