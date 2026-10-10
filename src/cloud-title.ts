import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { z } from "zod";

const cloudOverviewSchema = z.object({
  enabled: z.boolean(),
  status: z.discriminatedUnion("ready", [
    z.object({ ready: z.literal(true) }),
    z.object({ ready: z.literal(false), message: z.string() }),
  ]),
});
const accountFetchSchema = z.object({ status: z.number().int(), body: z.json().nullable() });
const completionSchema = z.object({ text: z.string() });
const failureSchema = z.object({ error: z.object({ message: z.string() }) });

/** Use the same authenticated gateway as bb-ai, without reading credentials. */
export async function completeCloudTitle(bb: BbPluginApi, prompt: string, signal: AbortSignal) {
  const overview = await bb.sdk.plugins.callRpc({
    pluginId: "bb-ai",
    method: "overview",
    input: null,
    outputSchema: cloudOverviewSchema,
    signal,
  });
  if (!overview.enabled) throw new Error("bb cloud is off. Turn it on with `bb ai on`.");
  if (!overview.status.ready) throw new Error(overview.status.message);
  signal.throwIfAborted();
  const response = await bb.sdk.plugins.callRpc({
    pluginId: "bb-account",
    method: "bb-account.v1.fetch",
    input: {
      target: "api",
      method: "POST",
      path: "/api/ai/v1/complete",
      body: { prompt },
      timeoutMs: 5_000,
    },
    outputSchema: accountFetchSchema,
    signal,
  });
  if (response.status !== 200) {
    const failure = failureSchema.safeParse(response.body);
    throw new Error(failure.success ? failure.data.error.message : `bb cloud request failed (${response.status})`);
  }
  const completion = completionSchema.safeParse(response.body);
  if (!completion.success) throw new Error("bb cloud returned an invalid reply");
  return completion.data.text;
}
