import type { PluginClientContext } from "@getpaseo/plugin";
import { UsagePill } from "./usage-pill.client";
import { refreshUsageSnapshot } from "./usage-query";
import { registerUsagePills } from "./usage-registration";

export function contributeClient(client: PluginClientContext) {
  return registerUsagePills(client, UsagePill, refreshUsageSnapshot);
}
