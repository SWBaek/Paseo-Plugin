import type { PluginContext } from "@getpaseo/plugin";
import {
  fileBrowserCreateDownload,
  fileBrowserCreateDirectoryDownload,
  fileBrowserCreateSelectionDownload,
  fileBrowserListDirectory,
  fileBrowserListRoots,
  fileBrowserPreviewFile,
} from "./file-browser.shared";
import {
  createFileBrowserDirectoryDownload,
  createFileBrowserDownload,
  createFileBrowserSelectionDownload,
  stopFileBrowserDownloads,
} from "./file-download.server";
import {
  listFileBrowserDirectory,
  listFileBrowserRoots,
  previewFileBrowserFile,
} from "./file-browser.server";
import { MainSurface } from "./main.client";

export default function contribute(plugin: PluginContext) {
  plugin.handle(fileBrowserListRoots, () => listFileBrowserRoots());
  plugin.handle(fileBrowserListDirectory, (input) => listFileBrowserDirectory(input));
  plugin.handle(fileBrowserPreviewFile, (input) => previewFileBrowserFile(input));
  plugin.handle(fileBrowserCreateDownload, (input) => createFileBrowserDownload(input));
  plugin.handle(fileBrowserCreateDirectoryDownload, (input) =>
    createFileBrowserDirectoryDownload(input),
  );
  plugin.handle(fileBrowserCreateSelectionDownload, (input) =>
    createFileBrowserSelectionDownload(input),
  );
  plugin.addSurface("main", MainSurface);
  plugin.addSidebarItem({
    id: "main",
    title: "File Browser",
    icon: "FolderTree",
    surface: "main",
  });
  return async () => {
    if (typeof stopFileBrowserDownloads === "function") {
      await stopFileBrowserDownloads();
    }
  };
}
