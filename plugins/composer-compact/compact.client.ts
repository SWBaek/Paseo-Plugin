import type { PluginClientContext } from "@getpaseo/plugin";
import { CompactPill } from "./compact-pill.client";
import { registerCompactPills } from "./compact-registration";

export function contributeClient(client: PluginClientContext) {
  return registerCompactPills(client, CompactPill);
}
