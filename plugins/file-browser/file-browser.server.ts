import { lstat, open, readdir, realpath } from "node:fs/promises";
import type { Dirent } from "node:fs";
import type { FileHandle } from "node:fs/promises";
import path from "node:path";
import { TextDecoder } from "node:util";
import {
  FILE_BROWSER_PAGE_SIZE,
  FILE_PREVIEW_LIMIT_BYTES,
  type DirectoryEntry,
  type DirectoryPage,
  type FileBrowserRoot,
  type FilePreview,
} from "./file-browser.shared";

export interface FileBrowserRootConfig {
  id: string;
  label: string;
  path: string;
}

export interface FileBrowserServiceOptions {
  roots?: readonly FileBrowserRootConfig[];
  platform?: NodeJS.Platform;
}

export interface OpenedDownloadFile {
  handle: FileHandle;
  name: string;
  sizeBytes: number;
}

const DEFAULT_ROOTS: readonly FileBrowserRootConfig[] = [
  { id: "projects", label: "Projects", path: "C:\\Projects" },
];

const WINDOWS_RESERVED_NAME = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i;
const SENSITIVE_EXACT_NAMES = new Set([
  ".env",
  ".npmrc",
  ".pypirc",
  "credentials",
  "credentials.json",
  "id_ed25519",
  "id_rsa",
]);

function publicError(message: string): Error {
  return new Error(message);
}

export function validatePathSegment(segment: string): void {
  if (
    segment.length === 0 ||
    segment.length > 255 ||
    segment === "." ||
    segment === ".." ||
    /[<>:"/\\|?*\u0000-\u001f]/.test(segment) ||
    /[. ]$/.test(segment) ||
    WINDOWS_RESERVED_NAME.test(segment)
  ) {
    throw publicError("허용되지 않는 Windows 경로 이름입니다.");
  }
}

export function isSensitiveFileName(name: string): boolean {
  const normalized = name.toLocaleLowerCase("en-US");
  return (
    SENSITIVE_EXACT_NAMES.has(normalized) ||
    normalized.startsWith(".env.") ||
    normalized.endsWith(".pem") ||
    normalized.endsWith(".key")
  );
}

function normalizeWindowsPath(value: string): string {
  const normalized = path.win32.normalize(path.win32.resolve(value));
  const withoutTrailingSeparators = normalized.replace(/[\\/]+$/, "");
  return (withoutTrailingSeparators || normalized).toLocaleLowerCase("en-US");
}

function isWithinRoot(root: string, candidate: string): boolean {
  const normalizedRoot = normalizeWindowsPath(root);
  const normalizedCandidate = normalizeWindowsPath(candidate);
  return (
    normalizedCandidate === normalizedRoot ||
    normalizedCandidate.startsWith(`${normalizedRoot}\\`)
  );
}

function entryKind(entry: Dirent<string>): DirectoryEntry["kind"] {
  if (entry.isSymbolicLink()) return "link";
  if (entry.isDirectory()) return "directory";
  if (entry.isFile()) return "file";
  return "other";
}

function compareEntries(left: DirectoryEntry, right: DirectoryEntry): number {
  const rank: Record<DirectoryEntry["kind"], number> = {
    directory: 0,
    file: 1,
    link: 2,
    other: 3,
  };
  const kindDifference = rank[left.kind] - rank[right.kind];
  if (kindDifference !== 0) return kindDifference;
  const natural = left.name.localeCompare(right.name, "en-US", {
    numeric: true,
    sensitivity: "base",
  });
  return natural !== 0 ? natural : left.name.localeCompare(right.name, "en-US");
}

function parseCursor(cursor: string | null, total: number): number {
  if (cursor === null) return 0;
  if (!/^\d+$/.test(cursor)) throw publicError("폴더 페이지 위치가 올바르지 않습니다.");
  const offset = Number(cursor);
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > total) {
    throw publicError("폴더 페이지 위치가 올바르지 않습니다.");
  }
  return offset;
}

function decodePreview(bytes: Uint8Array, truncated: boolean): {
  content: string;
  encoding: FilePreview["encoding"];
} {
  let encoding: FilePreview["encoding"] = "utf-8";
  let offset = 0;
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    encoding = "utf-16le";
    offset = 2;
  } else if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    encoding = "utf-16be";
    offset = 2;
  } else if (
    bytes.length >= 3 &&
    bytes[0] === 0xef &&
    bytes[1] === 0xbb &&
    bytes[2] === 0xbf
  ) {
    offset = 3;
  }

  try {
    const content = new TextDecoder(encoding, { fatal: true }).decode(bytes.subarray(offset), {
      stream: truncated,
    });
    if (content.includes("\0")) throw publicError("바이너리 파일은 미리 볼 수 없습니다.");
    return { content, encoding };
  } catch (error) {
    if (error instanceof Error && error.message === "바이너리 파일은 미리 볼 수 없습니다.") {
      throw error;
    }
    throw publicError("바이너리 또는 지원하지 않는 인코딩의 파일은 미리 볼 수 없습니다.");
  }
}

export function createFileBrowserService(options: FileBrowserServiceOptions = {}) {
  const platform = options.platform ?? process.platform;
  const roots = options.roots ?? DEFAULT_ROOTS;
  const rootsById = new Map(roots.map((root) => [root.id, root]));

  function requireWindows(): void {
    if (platform !== "win32") {
      throw publicError("File Browser는 Windows daemon에서만 사용할 수 있습니다.");
    }
  }

  function rootFor(rootId: string): FileBrowserRootConfig {
    const root = rootsById.get(rootId);
    if (!root) throw publicError("허용되지 않은 파일 루트입니다.");
    return root;
  }

  async function resolveExisting(rootId: string, segments: readonly string[]) {
    requireWindows();
    if (segments.length > 128) throw publicError("경로가 너무 깊습니다.");
    for (const segment of segments) validatePathSegment(segment);

    const root = rootFor(rootId);
    const lexicalRoot = path.win32.resolve(root.path);
    const lexicalTarget = path.win32.resolve(lexicalRoot, ...segments);
    if (!isWithinRoot(lexicalRoot, lexicalTarget)) {
      throw publicError("경로가 허용된 파일 루트를 벗어났습니다.");
    }

    try {
      const rootInfo = await lstat(lexicalRoot);
      if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink()) {
        throw publicError("허용된 파일 루트를 열 수 없습니다.");
      }
      const physicalRoot = await realpath(lexicalRoot);

      let current = lexicalRoot;
      for (const segment of segments) {
        current = path.win32.join(current, segment);
        const info = await lstat(current);
        if (info.isSymbolicLink()) {
          throw publicError("링크와 junction은 열 수 없습니다.");
        }
      }

      const physicalTarget = await realpath(lexicalTarget);
      if (!isWithinRoot(physicalRoot, physicalTarget)) {
        throw publicError("경로가 허용된 파일 루트를 벗어났습니다.");
      }
      return { root, lexicalTarget, physicalTarget };
    } catch (error) {
      if (
        error instanceof Error &&
        [
          "허용된 파일 루트를 열 수 없습니다.",
          "링크와 junction은 열 수 없습니다.",
          "경로가 허용된 파일 루트를 벗어났습니다.",
        ].includes(error.message)
      ) {
        throw error;
      }
      throw publicError("해당 파일 또는 폴더를 찾거나 열 수 없습니다.");
    }
  }

  async function listRoots(): Promise<{ roots: FileBrowserRoot[] }> {
    requireWindows();
    const inspected = await Promise.all(
      roots.map(async (root): Promise<FileBrowserRoot> => {
        let available = false;
        try {
          const info = await lstat(path.win32.resolve(root.path));
          available = info.isDirectory() && !info.isSymbolicLink();
        } catch {
          available = false;
        }
        return { id: root.id, label: root.label, path: root.path, available };
      }),
    );
    return { roots: inspected };
  }

  async function listDirectory(input: {
    rootId: string;
    segments: string[];
    cursor: string | null;
  }): Promise<DirectoryPage> {
    const resolved = await resolveExisting(input.rootId, input.segments);
    let entries;
    try {
      entries = await readdir(resolved.physicalTarget, { withFileTypes: true });
    } catch {
      throw publicError("폴더를 읽을 수 없습니다.");
    }

    const normalized: DirectoryEntry[] = entries
      .map((entry) => {
        const kind = entryKind(entry);
        return {
          name: entry.name,
          kind,
          previewStatus:
            kind === "file"
              ? isSensitiveFileName(entry.name)
                ? "sensitive"
                : "available"
              : "unsupported",
        } satisfies DirectoryEntry;
      })
      .sort(compareEntries);

    const offset = parseCursor(input.cursor, normalized.length);
    const pageEntries = normalized.slice(offset, offset + FILE_BROWSER_PAGE_SIZE);
    const nextOffset = offset + pageEntries.length;
    const hasMore = nextOffset < normalized.length;

    return {
      rootId: resolved.root.id,
      segments: [...input.segments],
      displayPath: path.win32.join(resolved.root.path, ...input.segments),
      entries: pageEntries,
      pageInfo: { hasMore, nextCursor: hasMore ? String(nextOffset) : null },
    };
  }

  async function previewFile(input: {
    rootId: string;
    segments: string[];
  }): Promise<FilePreview> {
    const name = input.segments.at(-1);
    if (!name) throw publicError("미리 볼 파일을 선택하세요.");
    if (isSensitiveFileName(name)) {
      throw publicError("민감 파일은 미리 볼 수 없습니다.");
    }

    const resolved = await resolveExisting(input.rootId, input.segments);
    let handle;
    try {
      const info = await lstat(resolved.physicalTarget);
      if (!info.isFile() || info.isSymbolicLink()) {
        throw publicError("일반 파일만 미리 볼 수 있습니다.");
      }
      handle = await open(resolved.physicalTarget, "r");
      const openedInfo = await handle.stat();
      if (!openedInfo.isFile()) throw publicError("일반 파일만 미리 볼 수 있습니다.");

      const buffer = Buffer.alloc(FILE_PREVIEW_LIMIT_BYTES + 1);
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
      const truncated = openedInfo.size > FILE_PREVIEW_LIMIT_BYTES || bytesRead > FILE_PREVIEW_LIMIT_BYTES;
      const previewBytes = buffer.subarray(0, Math.min(bytesRead, FILE_PREVIEW_LIMIT_BYTES));
      const decoded = decodePreview(previewBytes, truncated);

      return {
        rootId: resolved.root.id,
        segments: [...input.segments],
        displayPath: path.win32.join(resolved.root.path, ...input.segments),
        content: decoded.content,
        encoding: decoded.encoding,
        sizeBytes: openedInfo.size,
        truncated,
      };
    } catch (error) {
      if (
        error instanceof Error &&
        [
          "일반 파일만 미리 볼 수 있습니다.",
          "바이너리 파일은 미리 볼 수 없습니다.",
          "바이너리 또는 지원하지 않는 인코딩의 파일은 미리 볼 수 없습니다.",
        ].includes(error.message)
      ) {
        throw error;
      }
      throw publicError("파일을 미리 볼 수 없습니다.");
    } finally {
      await handle?.close();
    }
  }

  async function openDownloadFile(input: {
    rootId: string;
    segments: string[];
  }): Promise<OpenedDownloadFile> {
    const name = input.segments.at(-1);
    if (!name) throw publicError("다운로드할 파일을 선택하세요.");
    if (isSensitiveFileName(name)) {
      throw publicError("민감 파일은 다운로드할 수 없습니다.");
    }

    const resolved = await resolveExisting(input.rootId, input.segments);
    let handle: FileHandle | undefined;
    try {
      const info = await lstat(resolved.physicalTarget);
      if (!info.isFile() || info.isSymbolicLink()) {
        throw publicError("일반 파일만 다운로드할 수 있습니다.");
      }
      handle = await open(resolved.physicalTarget, "r");
      const openedInfo = await handle.stat();
      if (!openedInfo.isFile()) throw publicError("일반 파일만 다운로드할 수 있습니다.");
      return { handle, name, sizeBytes: openedInfo.size };
    } catch (error) {
      await handle?.close();
      if (
        error instanceof Error &&
        ["일반 파일만 다운로드할 수 있습니다."].includes(error.message)
      ) {
        throw error;
      }
      throw publicError("파일을 다운로드할 수 없습니다.");
    }
  }

  return { listRoots, listDirectory, previewFile, openDownloadFile };
}

const defaultFileBrowserService = createFileBrowserService();

export function listFileBrowserRoots() {
  return defaultFileBrowserService.listRoots();
}

export function listFileBrowserDirectory(input: {
  rootId: string;
  segments: string[];
  cursor: string | null;
}) {
  return defaultFileBrowserService.listDirectory(input);
}

export function previewFileBrowserFile(input: {
  rootId: string;
  segments: string[];
}) {
  return defaultFileBrowserService.previewFile(input);
}

export function openFileBrowserDownload(input: {
  rootId: string;
  segments: string[];
}) {
  return defaultFileBrowserService.openDownloadFile(input);
}
