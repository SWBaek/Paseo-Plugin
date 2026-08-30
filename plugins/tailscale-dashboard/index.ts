import type { PluginContext } from "@getpaseo/plugin";
import { discoverTailscaleDashboard } from "./tailscale-dashboard.server";
import { tailscaleDashboardDiscover } from "./tailscale-dashboard.shared";
import { MainSurface } from "./main.client";

export default function contribute(plugin: PluginContext) {
  plugin.handle(tailscaleDashboardDiscover, () => discoverTailscaleDashboard());
  plugin.addSurface("main", MainSurface);
  plugin.addSidebarItem({
    id: "main",
    title: "Tailscale Dashboard",
    icon: "Gauge",
    surface: "main",
  });
  return () => {};
}
