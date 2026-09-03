import type { DirectoryEntry, DirectoryPage } from "./file-browser.shared";

export function enterDirectory(segments: readonly string[], name: string): string[] {
  return [...segments, name];
}

export function parentDirectory(segments: readonly string[]): string[] {
  return segments.slice(0, -1);
}

export function breadcrumbSegments(segments: readonly string[]): Array<{
  label: string;
  segments: string[];
}> {
  return segments.map((label, index) => ({ label, segments: segments.slice(0, index + 1) }));
}

export function flattenDirectoryPages(
  pages: readonly DirectoryPage[] | undefined,
): DirectoryEntry[] {
  return pages?.flatMap((page) => page.entries) ?? [];
}
