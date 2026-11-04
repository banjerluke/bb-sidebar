import type { BbPluginApi } from "@get-bb/plugin-sdk";

/**
 * Regenerate a thread's title with bb's own title service, which writes it
 * from the first task, the latest user messages, and the agent's replies. bb
 * keeps a title that still fits and rejects with the reason when it cannot.
 */
export function createTitleRegenerator(bb: BbPluginApi) {
  return async (threadId: string): Promise<{ title: string }> => {
    const thread = await bb.sdk.threads.experimental_regenerateTitle({ threadId });
    if (!thread.title) throw new Error("bb could not title this thread");
    return { title: thread.title };
  };
}
