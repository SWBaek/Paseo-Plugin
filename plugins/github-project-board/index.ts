import type { PluginContext } from "@getpaseo/plugin";
import { listGithubProjects, scanGithubProject } from "./github-project-board.server";
import {
  githubProjectBoardList,
  githubProjectBoardScan,
} from "./github-project-board.shared";
import { MainSurface } from "./main.client";

export default function contribute(plugin: PluginContext) {
  plugin.handle(githubProjectBoardList, () => listGithubProjects());
  plugin.handle(githubProjectBoardScan, ({ number }) => scanGithubProject(number));
  plugin.addSurface("main", MainSurface);
  plugin.addSidebarItem({
    id: "main",
    title: "GitHub Board",
    icon: "Columns3",
    surface: "main",
  });
  return () => {};
}
