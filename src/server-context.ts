import type { BbPluginApi, PluginRpcHandlers } from "@get-bb/plugin-sdk";
import type { bbSidebarRpcContract } from "./contract";

export interface ServerContext {
  bb: BbPluginApi;
  db: ReturnType<BbPluginApi["storage"]["database"]>;
}

export type ServerHandlers = PluginRpcHandlers<typeof bbSidebarRpcContract>;
