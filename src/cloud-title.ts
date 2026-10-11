import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { cloudOverviewSchema, accountFetchSchema, completionSchema, failureSchema } from "./cloud-title-schemas";

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
