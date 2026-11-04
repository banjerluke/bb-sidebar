/**
 * A settle that waits: an agent asked to settle a thread (usually its own)
 * while it was still working or before you had read its result.
 *
 * The request carries out once the thread is idle and you have read it, so a
 * thread never leaves Active with an answer you have not seen. A failure
 * cancels it, because a failed thread is not finished; so does a message you
 * send, because you are not done with it either.
 */
export type SettleRequestDecision = "settle" | "wait" | "drop";

interface SettleRequestSignals {
  /** The last turn failed, or a queued message failed to send. */
  failed: boolean;
  /** Anything that blocks parking: live work, a raised hand, queued work. */
  busy: boolean;
  isUnread: boolean;
}

export function decideSettleRequest(signals: SettleRequestSignals): SettleRequestDecision {
  if (signals.failed) return "drop";
  if (signals.busy || signals.isUnread) return "wait";
  return "settle";
}
