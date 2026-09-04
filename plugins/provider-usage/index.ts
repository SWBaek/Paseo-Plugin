import type { PluginContext } from "@getpaseo/plugin";
import { MainSurface } from "./main.client";
import { listProviderUsageSnapshot } from "./provider-usage.server";
import { providerUsageSnapshot } from "./provider-usage.shared";
import { contributeClient } from "./usage.client";

export default function contribute(plugin: PluginContext) {
  plugin.handle(providerUsageSnapshot, (input) => listProviderUsageSnapshot(input));
  plugin.addSurface("main", MainSurface);
  plugin.addSidebarItem({
    id: "main",
    title: "Usage",
    icon: "Gauge",
    surface: "main",
  });
  plugin.addCommandCenterItem({
    id: "open-usage",
    title: "Open provider usage",
    icon: "Gauge",
    keywords: ["quota", "limits", "credits"],
    context: "global",
    onSelect({ openSurface }) {
      openSurface("main");
    },
  });
  plugin.addClientSide(contributeClient);
  return () => {};
}
