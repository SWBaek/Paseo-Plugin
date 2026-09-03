import { describe, expect, it } from "vitest";
import {
  assertReadOnlyArchiveGitCommand,
  isDefaultArchiveExcluded,
} from "./archive-filter.server";

describe("archive default exclusions", () => {
  it("excludes generated dependency, cache, coverage, and temporary content", () => {
    for (const segments of [
      ["node_modules"],
      [".git"],
      ["coverage"],
      [".venv"],
      ["__pycache__"],
      [".yarn", "cache"],
    ]) {
      expect(isDefaultArchiveExcluded(segments, "directory")).toBe(true);
    }
    for (const segments of [
      ["debug.log"],
      ["scratch.tmp"],
      ["Thumbs.db"],
      ["nested", ".DS_Store"],
    ]) {
      expect(isDefaultArchiveExcluded(segments, "file")).toBe(true);
    }
  });

  it("keeps ordinary source paths and does not classify files as sensitive", () => {
    expect(isDefaultArchiveExcluded(["src", "index.ts"], "file")).toBe(false);
    expect(isDefaultArchiveExcluded(["dist"], "directory")).toBe(false);
    expect(isDefaultArchiveExcluded([".env"], "file")).toBe(false);
  });

  it("allows only the exact read-only Git commands used for filtering", () => {
    expect(() =>
      assertReadOnlyArchiveGitCommand(["rev-parse", "--is-inside-work-tree"]),
    ).not.toThrow();
    expect(() =>
      assertReadOnlyArchiveGitCommand([
        "ls-files",
        "-z",
        "--cached",
        "--others",
        "--exclude-standard",
        "--",
        ".",
      ]),
    ).not.toThrow();
    expect(() => assertReadOnlyArchiveGitCommand(["status"])).toThrow(
      "Blocked non-read-only Git command",
    );
    expect(() => assertReadOnlyArchiveGitCommand(["add", "."])).toThrow(
      "Blocked non-read-only Git command",
    );
  });
});
