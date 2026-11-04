import { useCallback, useEffect, useRef, useState } from "react";
import { useRealtime, useRealtimeConnectionState, useRpc } from "@get-bb/plugin-sdk/app";
import type { bbSidebarRpcContract } from "./contract";
import { THREAD_NOTES_CHANNEL } from "./realtime-channels";
import type { ThreadNote } from "./thread-note";

const EMPTY: ReadonlyMap<string, ThreadNote> = new Map();

/** Every thread's note, kept current by the notes channel. */
export function useThreadNotes(): ReadonlyMap<string, ThreadNote> {
  const rpc = useRpc<typeof bbSidebarRpcContract>();
  const connection = useRealtimeConnectionState();
  const previousConnection = useRef(connection);
  const [notes, setNotes] = useState(EMPTY);
  const request = useRef(0);
  const load = useCallback(async () => {
    const seq = ++request.current;
    try {
      const result = await rpc.call("listThreadNotes", {});
      if (seq === request.current) setNotes(new Map(Object.entries(result.notes)));
    } catch {
      // Keep the last notes while the backend reloads; the next signal retries.
    }
  }, [rpc]);
  useEffect(() => {
    void load();
    return () => {
      request.current += 1;
    };
  }, [load]);
  useRealtime(THREAD_NOTES_CHANNEL, () => {
    void load();
  });
  useEffect(() => {
    if (connection === "connected" && previousConnection.current !== "connected") void load();
    previousConnection.current = connection;
  }, [connection, load]);
  return notes;
}
