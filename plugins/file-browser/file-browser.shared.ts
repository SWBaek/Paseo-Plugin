import { defineRpc } from "@getpaseo/plugin/server";
import { z } from "zod";

export const FILE_BROWSER_PAGE_SIZE = 200;
export const FILE_PREVIEW_LIMIT_BYTES = 64 * 1024;
export const FILE_DOWNLOAD_TOKEN_TTL_MS = 60 * 1000;
export const DIRECTORY_DOWNLOAD_MAX_ENTRIES = 10_000;
export const DIRECTORY_DOWNLOAD_MAX_BYTES = 2 * 1024 * 1024 * 1024;
export const DIRECTORY_DOWNLOAD_MAX_DEPTH = 64;
export const ARCHIVE_SELECTION_MAX_ITEMS = 100;

export const PathSegmentsSchema = z.array(z.string().min(1).max(255)).max(128);
export const EntryKindSchema = z.enum(["directory", "file", "link", "other"]);
export const PreviewStatusSchema = z.enum(["available", "sensitive", "unsupported"]);
export const ArchiveStatusSchema = z.enum(["available", "excluded", "blocked"]);

export const FileBrowserRootSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  path: z.string().min(1),
  available: z.boolean(),
});

export const DirectoryEntrySchema = z.object({
  name: z.string().min(1),
  kind: EntryKindSchema,
  previewStatus: PreviewStatusSchema,
  archiveStatus: ArchiveStatusSchema,
});

export const DirectoryPageSchema = z.object({
  rootId: z.string().min(1),
  segments: PathSegmentsSchema,
  displayPath: z.string().min(1),
  entries: z.array(DirectoryEntrySchema).max(FILE_BROWSER_PAGE_SIZE),
  pageInfo: z.object({
    hasMore: z.boolean(),
    nextCursor: z.string().nullable(),
  }),
});

export const FilePreviewSchema = z.object({
  rootId: z.string().min(1),
  segments: PathSegmentsSchema,
  displayPath: z.string().min(1),
  content: z.string(),
  encoding: z.enum(["utf-8", "utf-16le", "utf-16be"]),
  sizeBytes: z.number().int().nonnegative(),
  truncated: z.boolean(),
});

export const fileBrowserListRoots = defineRpc({
  name: "file-browser.roots.list",
  input: z.object({}),
  output: z.object({ roots: z.array(FileBrowserRootSchema).max(8) }),
});

export const fileBrowserListDirectory = defineRpc({
  name: "file-browser.directory.list",
  input: z.object({
    rootId: z.string().min(1).max(64),
    segments: PathSegmentsSchema,
    cursor: z.string().regex(/^\d+$/).nullable(),
  }),
  output: DirectoryPageSchema,
});

export const fileBrowserPreviewFile = defineRpc({
  name: "file-browser.file.preview",
  input: z.object({
    rootId: z.string().min(1).max(64),
    segments: PathSegmentsSchema.min(1),
  }),
  output: FilePreviewSchema,
});

export const fileBrowserCreateDownload = defineRpc({
  name: "file-browser.file.download.create",
  input: z.object({
    rootId: z.string().min(1).max(64),
    segments: PathSegmentsSchema.min(1),
  }),
  output: z.object({
    url: z.string().url(),
    expiresAt: z.string().datetime(),
  }),
});

export const fileBrowserCreateDirectoryDownload = defineRpc({
  name: "file-browser.directory.download.create",
  input: z.object({
    rootId: z.string().min(1).max(64),
    segments: PathSegmentsSchema.min(1),
  }),
  output: z.object({
    url: z.string().url(),
    expiresAt: z.string().datetime(),
  }),
});

export const fileBrowserCreateSelectionDownload = defineRpc({
  name: "file-browser.selection.download.create",
  input: z.object({
    rootId: z.string().min(1).max(64),
    segments: PathSegmentsSchema,
    names: z.array(z.string().min(1).max(255)).min(1).max(ARCHIVE_SELECTION_MAX_ITEMS),
  }),
  output: z.object({
    url: z.string().url(),
    expiresAt: z.string().datetime(),
  }),
});

export type FileBrowserRoot = z.infer<typeof FileBrowserRootSchema>;
export type DirectoryEntry = z.infer<typeof DirectoryEntrySchema>;
export type DirectoryPage = z.infer<typeof DirectoryPageSchema>;
export type FilePreview = z.infer<typeof FilePreviewSchema>;
export type PreviewStatus = z.infer<typeof PreviewStatusSchema>;
export type ArchiveStatus = z.infer<typeof ArchiveStatusSchema>;
