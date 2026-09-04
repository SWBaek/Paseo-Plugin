import type { PluginClientContext } from "@getpaseo/plugin";
import { UsagePill } from "./usage-pill.client";
import { registerUsagePills } from "./usage-registration";

export function contributeClient(client: PluginClientContext) {
  return registerUsagePills(client, UsagePill);
}
