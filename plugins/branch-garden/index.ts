import type { PluginContext } from "@getpaseo/plugin";
import type { PaseoProject, PaseoWorkspace } from "@getpaseo/client";
import { branchGardenScan } from "./branch-garden.shared";
import { scanBranchGarden } from "./branch-garden.server";
import { MainSurface } from "./main.client";

export default function contribute(plugin: PluginContext) {
  plugin.handle(branchGardenScan, (_input, { paseo }) =>
    scanBranchGarden({
      projects: {
        async list() {
          const result = await paseo.projects.list();
          return {
            projects: result.projects.map((project: PaseoProject) => ({
              id: project.projectId,
              displayName: project.projectDisplayName,
              rootPath: project.projectRootPath,
              kind: project.projectKind,
            })),
          };
        },
      },
      workspaces: {
        async list(page) {
          const result = await paseo.workspaces.list({ page });
          return {
            entries: result.entries.map((workspace: PaseoWorkspace) => ({
              id: workspace.id,
              projectId: workspace.projectId,
              projectDisplayName: workspace.projectDisplayName,
              projectRootPath: workspace.projectRootPath,
              projectKind: workspace.projectKind,
              workspaceDirectory: workspace.workspaceDirectory,
              name: workspace.name,
              title: workspace.title ?? null,
              archivingAt: workspace.archivingAt,
              gitRuntime: workspace.gitRuntime
                ? {
                    currentBranch: workspace.gitRuntime.currentBranch ?? null,
                    isDirty: workspace.gitRuntime.isDirty ?? null,
                  }
                : null,
            })),
            pageInfo: result.pageInfo,
          };
        },
      },
    }),
  );
  plugin.addSurface("main", MainSurface);
  plugin.addSidebarItem({
    id: "main",
    title: "Branch Garden",
    icon: "Sprout",
    surface: "main",
  });
  return () => {};
}
