import { describe, expect, it } from "vitest";
import type { DirectoryPage } from "./file-browser.shared";
import {
  breadcrumbSegments,
  enterDirectory,
  flattenDirectoryPages,
  parentDirectory,
} from "./file-browser.view";

describe("file-browser view helpers", () => {
  it("navigates without mutating the current segment array", () => {
    const current = ["repo"];
    expect(enterDirectory(current, "src")).toEqual(["repo", "src"]);
    expect(parentDirectory(current)).toEqual([]);
    expect(current).toEqual(["repo"]);
  });

  it("builds clickable breadcrumb destinations", () => {
    expect(breadcrumbSegments(["repo", "src", "components"])).toEqual([
      { label: "repo", segments: ["repo"] },
      { label: "src", segments: ["repo", "src"] },
      { label: "components", segments: ["repo", "src", "components"] },
    ]);
  });

  it("flattens directory pages in server order", () => {
    const page = (name: string): DirectoryPage => ({
      rootId: "projects",
      segments: [],
      displayPath: "C:\\Projects",
      entries: [
        { name, kind: "file", previewStatus: "available", archiveStatus: "available" },
      ],
      pageInfo: { hasMore: false, nextCursor: null },
    });
    expect(flattenDirectoryPages([page("a"), page("b")]).map((entry) => entry.name)).toEqual([
      "a",
      "b",
    ]);
    expect(flattenDirectoryPages(undefined)).toEqual([]);
  });
});
