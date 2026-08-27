import type { PluginContext } from "@getpaseo/plugin";
import { scanGithubProject } from "./github-project-board.server";
import { githubProjectBoardScan } from "./github-project-board.shared";
import { MainSurface } from "./main.client";

export default function contribute(plugin: PluginContext) {
  plugin.handle(githubProjectBoardScan, () => scanGithubProject());
  plugin.addSurface("main", MainSurface);
  plugin.addSidebarItem({
    id: "main",
    title: "GitHub Board",
    icon: "Columns3",
    surface: "main",
  });
  return () => {};
}
