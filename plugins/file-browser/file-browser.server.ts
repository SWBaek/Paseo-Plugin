import { lstat, open, readdir, realpath } from "node:fs/promises";
import type { Dirent } from "node:fs";
import type { FileHandle } from "node:fs/promises";
import path from "node:path";
import { TextDecoder } from "node:util";
import {
  isDefaultArchiveExcluded,
  listGitArchiveFiles,
} from "./archive-filter.server";
import {
  ARCHIVE_SELECTION_MAX_ITEMS,
  DIRECTORY_DOWNLOAD_MAX_BYTES,
  DIRECTORY_DOWNLOAD_MAX_DEPTH,
  DIRECTORY_DOWNLOAD_MAX_ENTRIES,
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
  directoryDownloadLimits?: Partial<DirectoryDownloadLimits>;
  listGitFiles?: (directory: string) => Promise<string[] | null>;
}

export interface OpenedDownloadFile {
  handle: FileHandle;
  name: string;
  sizeBytes: number;
}

export interface DownloadDirectoryEntry {
  kind: "directory" | "file";
  segments: string[];
  archivePath: string;
  sizeBytes: number;
  modifiedAtMs: number;
}

export interface DownloadDirectoryManifest {
  rootId: string;
  segments: string[];
  name: string;
  selectionNames?: string[];
  entries: DownloadDirectoryEntry[];
  totalSizeBytes: number;
}

export interface DirectoryDownloadLimits {
  maxEntries: number;
  maxBytes: number;
  maxDepth: number;
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
  const directoryDownloadLimits: DirectoryDownloadLimits = {
    maxEntries: options.directoryDownloadLimits?.maxEntries ?? DIRECTORY_DOWNLOAD_MAX_ENTRIES,
    maxBytes: options.directoryDownloadLimits?.maxBytes ?? DIRECTORY_DOWNLOAD_MAX_BYTES,
    maxDepth: options.directoryDownloadLimits?.maxDepth ?? DIRECTORY_DOWNLOAD_MAX_DEPTH,
  };
  const listGitFiles = options.listGitFiles ?? listGitArchiveFiles;

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
      return { root, lexicalTarget, physicalRoot, physicalTarget };
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
        const previewStatus =
          kind === "file"
            ? isSensitiveFileName(entry.name)
              ? "sensitive"
              : "available"
            : "unsupported";
        return {
          name: entry.name,
          kind,
          previewStatus,
          archiveStatus:
            kind === "link" || kind === "other" || previewStatus === "sensitive"
              ? "blocked"
              : kind === "directory" && isDefaultArchiveExcluded([entry.name], "directory")
                ? "excluded"
                : "available",
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

  function createArchiveAccumulator() {
    const entries: DownloadDirectoryEntry[] = [];
    const archivePaths = new Set<string>();
    let totalSizeBytes = 0;

    function addEntry(entry: DownloadDirectoryEntry): void {
      const archiveKey = entry.archivePath.toLocaleLowerCase("en-US");
      if (archivePaths.has(archiveKey)) return;
      if (Buffer.byteLength(entry.archivePath, "utf8") > 0xffff) {
        throw publicError("ZIP 안의 경로가 너무 깁니다.");
      }
      if (entries.length >= directoryDownloadLimits.maxEntries) {
        throw publicError(
          `폴더 항목은 최대 ${directoryDownloadLimits.maxEntries.toLocaleString("en-US")}개까지 다운로드할 수 있습니다.`,
        );
      }
      if (entry.kind === "file") {
        totalSizeBytes += entry.sizeBytes;
        if (totalSizeBytes > directoryDownloadLimits.maxBytes) {
          throw publicError("폴더의 비압축 크기는 최대 2 GiB까지 다운로드할 수 있습니다.");
        }
      }
      archivePaths.add(archiveKey);
      entries.push(entry);
    }

    return {
      addEntry,
      snapshot: () => ({ entries, totalSizeBytes }),
    };
  }

  async function appendRegularFile(
    rootId: string,
    segments: string[],
    archivePath: string,
    accumulator: ReturnType<typeof createArchiveAccumulator>,
    sensitiveContext: "selected" | "contained" = "selected",
  ): Promise<void> {
    const name = segments.at(-1);
    if (!name) throw publicError("다운로드할 파일을 선택하세요.");
    if (isSensitiveFileName(name)) {
      throw publicError(
        sensitiveContext === "contained"
          ? `민감 파일 ${name}이 포함된 폴더는 다운로드할 수 없습니다.`
          : `민감 파일 ${name}은 다운로드할 수 없습니다.`,
      );
    }
    const resolved = await resolveExisting(rootId, segments);
    const info = await lstat(resolved.physicalTarget);
    if (!info.isFile() || info.isSymbolicLink()) {
      throw publicError("일반 파일만 ZIP에 포함할 수 있습니다.");
    }
    accumulator.addEntry({
      kind: "file",
      segments: [...segments],
      archivePath,
      sizeBytes: info.size,
      modifiedAtMs: info.mtimeMs,
    });
  }

  async function appendSmartDirectory(
    rootId: string,
    directorySegments: string[],
    archiveRootName: string,
    accumulator: ReturnType<typeof createArchiveAccumulator>,
  ): Promise<void> {
    if (isDefaultArchiveExcluded([archiveRootName], "directory")) {
      throw publicError(`${archiveRootName} 폴더는 ZIP 기본 제외 대상입니다.`);
    }
    const resolved = await resolveExisting(rootId, directorySegments);
    const rootInfo = await lstat(resolved.physicalTarget);
    if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink()) {
      throw publicError("일반 폴더만 다운로드할 수 있습니다.");
    }
    accumulator.addEntry({
      kind: "directory",
      segments: [...directorySegments],
      archivePath: archiveRootName,
      sizeBytes: 0,
      modifiedAtMs: rootInfo.mtimeMs,
    });

    const gitFiles = await listGitFiles(resolved.physicalTarget);
    if (gitFiles !== null) {
      const sortedFiles = [...new Set(gitFiles)].sort((left, right) =>
        left.localeCompare(right, "en-US", { numeric: true, sensitivity: "base" }),
      );
      for (const gitPath of sortedFiles) {
        const relativeSegments = gitPath.replace(/\\/g, "/").split("/").filter(Boolean);
        if (relativeSegments.length === 0) continue;
        for (const segment of relativeSegments) validatePathSegment(segment);
        if (relativeSegments.length > directoryDownloadLimits.maxDepth) {
          throw publicError(
            `선택한 폴더부터 최대 ${directoryDownloadLimits.maxDepth}단계까지만 다운로드할 수 있습니다.`,
          );
        }
        if (isDefaultArchiveExcluded(relativeSegments, "file")) continue;

        const lexicalCandidate = path.win32.join(resolved.lexicalTarget, ...relativeSegments);
        try {
          await lstat(lexicalCandidate);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
          throw publicError("Git 파일을 검사할 수 없습니다.");
        }

        for (let depth = 1; depth < relativeSegments.length; depth += 1) {
          const directoryRelative = relativeSegments.slice(0, depth);
          if (isDefaultArchiveExcluded(directoryRelative, "directory")) break;
          const entrySegments = [...directorySegments, ...directoryRelative];
          const entryResolved = await resolveExisting(rootId, entrySegments);
          const info = await lstat(entryResolved.physicalTarget);
          if (!info.isDirectory() || info.isSymbolicLink()) {
            throw publicError("Git 파일 경로에 일반 폴더가 아닌 항목이 포함되어 있습니다.");
          }
          accumulator.addEntry({
            kind: "directory",
            segments: entrySegments,
            archivePath: [archiveRootName, ...directoryRelative].join("/"),
            sizeBytes: 0,
            modifiedAtMs: info.mtimeMs,
          });
        }

        await appendRegularFile(
          rootId,
          [...directorySegments, ...relativeSegments],
          [archiveRootName, ...relativeSegments].join("/"),
          accumulator,
          "contained",
        );
      }
      return;
    }

    async function walk(
      physicalDirectory: string,
      currentSegments: string[],
      relativeSegments: string[],
    ): Promise<void> {
      let children;
      try {
        children = await readdir(physicalDirectory, { withFileTypes: true });
      } catch {
        throw publicError("폴더 안의 모든 항목을 읽을 수 없습니다.");
      }
      children.sort((left, right) => {
        const leftRank = left.isDirectory() ? 0 : 1;
        const rightRank = right.isDirectory() ? 0 : 1;
        if (leftRank !== rightRank) return leftRank - rightRank;
        return left.name.localeCompare(right.name, "en-US", {
          numeric: true,
          sensitivity: "base",
        });
      });

      for (const child of children) {
        validatePathSegment(child.name);
        const nextRelative = [...relativeSegments, child.name];
        const childKind = child.isDirectory() ? "directory" : "file";
        if (isDefaultArchiveExcluded(nextRelative, childKind)) continue;
        if (nextRelative.length > directoryDownloadLimits.maxDepth) {
          throw publicError(
            `선택한 폴더부터 최대 ${directoryDownloadLimits.maxDepth}단계까지만 다운로드할 수 있습니다.`,
          );
        }
        const nextSegments = [...currentSegments, child.name];
        const physicalPath = path.win32.join(physicalDirectory, child.name);
        let info;
        let actualPath;
        try {
          info = await lstat(physicalPath);
          if (info.isSymbolicLink()) {
            throw publicError("링크와 junction이 포함된 폴더는 다운로드할 수 없습니다.");
          }
          actualPath = await realpath(physicalPath);
        } catch (error) {
          if (
            error instanceof Error &&
            error.message === "링크와 junction이 포함된 폴더는 다운로드할 수 없습니다."
          ) {
            throw error;
          }
          throw publicError("폴더 안의 모든 항목을 검사할 수 없습니다.");
        }
        if (!isWithinRoot(resolved.physicalRoot, actualPath)) {
          throw publicError("경로가 허용된 파일 루트를 벗어났습니다.");
        }

        const archivePath = [archiveRootName, ...nextRelative].join("/");
        if (info.isDirectory()) {
          accumulator.addEntry({
            kind: "directory",
            segments: nextSegments,
            archivePath,
            sizeBytes: 0,
            modifiedAtMs: info.mtimeMs,
          });
          await walk(actualPath, nextSegments, nextRelative);
          continue;
        }
        if (!info.isFile()) {
          throw publicError("지원하지 않는 항목이 포함된 폴더는 다운로드할 수 없습니다.");
        }
        await appendRegularFile(rootId, nextSegments, archivePath, accumulator, "contained");
      }
    }

    await walk(resolved.physicalTarget, [...directorySegments], []);
  }

  async function prepareDownloadDirectory(input: {
    rootId: string;
    segments: string[];
  }): Promise<DownloadDirectoryManifest> {
    const name = input.segments.at(-1);
    if (!name) throw publicError("C:\\Projects 루트 전체는 다운로드할 수 없습니다.");
    const accumulator = createArchiveAccumulator();
    await appendSmartDirectory(input.rootId, [...input.segments], name, accumulator);
    const snapshot = accumulator.snapshot();
    return {
      rootId: input.rootId,
      segments: [...input.segments],
      name,
      entries: snapshot.entries,
      totalSizeBytes: snapshot.totalSizeBytes,
    };
  }

  async function prepareDownloadSelection(input: {
    rootId: string;
    segments: string[];
    names: string[];
  }): Promise<DownloadDirectoryManifest> {
    if (input.names.length === 0 || input.names.length > ARCHIVE_SELECTION_MAX_ITEMS) {
      throw publicError(`한 번에 최대 ${ARCHIVE_SELECTION_MAX_ITEMS}개 항목을 선택할 수 있습니다.`);
    }
    const uniqueNames = new Map<string, string>();
    for (const name of input.names) {
      validatePathSegment(name);
      uniqueNames.set(name.toLocaleLowerCase("en-US"), name);
    }
    if (uniqueNames.size !== input.names.length) {
      throw publicError("같은 항목을 중복 선택할 수 없습니다.");
    }

    const base = await resolveExisting(input.rootId, input.segments);
    const baseInfo = await lstat(base.physicalTarget);
    if (!baseInfo.isDirectory() || baseInfo.isSymbolicLink()) {
      throw publicError("선택 항목의 기준 폴더를 열 수 없습니다.");
    }

    const names = [...uniqueNames.values()].sort((left, right) =>
      left.localeCompare(right, "en-US", { numeric: true, sensitivity: "base" }),
    );
    const accumulator = createArchiveAccumulator();
    let onlyDirectoryName: string | null = null;
    for (const name of names) {
      const entrySegments = [...input.segments, name];
      const resolved = await resolveExisting(input.rootId, entrySegments);
      const info = await lstat(resolved.physicalTarget);
      if (info.isDirectory() && !info.isSymbolicLink()) {
        onlyDirectoryName = names.length === 1 ? name : null;
        await appendSmartDirectory(input.rootId, entrySegments, name, accumulator);
        continue;
      }
      if (info.isFile() && !info.isSymbolicLink()) {
        await appendRegularFile(input.rootId, entrySegments, name, accumulator);
        continue;
      }
      throw publicError(`${name}은 ZIP에 포함할 수 없는 항목입니다.`);
    }
    const snapshot = accumulator.snapshot();
    return {
      rootId: input.rootId,
      segments: [...input.segments],
      selectionNames: names,
      name: onlyDirectoryName ?? `${input.segments.at(-1) ?? "Projects"}-selection`,
      entries: snapshot.entries,
      totalSizeBytes: snapshot.totalSizeBytes,
    };
  }

  async function revalidateDownloadDirectory(
    manifest: DownloadDirectoryManifest,
  ): Promise<DownloadDirectoryManifest> {
    const current = manifest.selectionNames
      ? await prepareDownloadSelection({
          rootId: manifest.rootId,
          segments: manifest.segments,
          names: manifest.selectionNames,
        })
      : await prepareDownloadDirectory({
          rootId: manifest.rootId,
          segments: manifest.segments,
        });
    const unchanged =
      current.totalSizeBytes === manifest.totalSizeBytes &&
      current.entries.length === manifest.entries.length &&
      current.entries.every((entry, index) => {
        const previous = manifest.entries[index];
        return previous !== undefined &&
          entry.kind === previous.kind &&
          entry.archivePath === previous.archivePath &&
          entry.sizeBytes === previous.sizeBytes &&
          entry.modifiedAtMs === previous.modifiedAtMs;
      });
    if (!unchanged) {
      throw publicError("다운로드를 준비한 뒤 폴더 내용이 변경되었습니다. 다시 시도하세요.");
    }
    return current;
  }

  async function openDownloadArchiveFile(
    manifest: DownloadDirectoryManifest,
    entry: DownloadDirectoryEntry,
  ): Promise<OpenedDownloadFile> {
    if (entry.kind !== "file") throw publicError("일반 파일만 압축할 수 있습니다.");
    if (isSensitiveFileName(entry.segments.at(-1) ?? "")) {
      throw publicError("민감 파일은 압축할 수 없습니다.");
    }
    const resolved = await resolveExisting(manifest.rootId, entry.segments);
    let handle: FileHandle | undefined;
    try {
      const info = await lstat(resolved.physicalTarget);
      if (!info.isFile() || info.isSymbolicLink()) {
        throw publicError("일반 파일만 압축할 수 있습니다.");
      }
      handle = await open(resolved.physicalTarget, "r");
      const openedInfo = await handle.stat();
      if (
        !openedInfo.isFile() ||
        openedInfo.size !== entry.sizeBytes ||
        openedInfo.mtimeMs !== entry.modifiedAtMs
      ) {
        throw publicError("압축하는 동안 파일이 변경되었습니다.");
      }
      return { handle, name: entry.segments.at(-1)!, sizeBytes: openedInfo.size };
    } catch (error) {
      await handle?.close();
      if (
        error instanceof Error &&
        ["일반 파일만 압축할 수 있습니다.", "압축하는 동안 파일이 변경되었습니다."].includes(error.message)
      ) {
        throw error;
      }
      throw publicError("폴더 안의 파일을 압축할 수 없습니다.");
    }
  }

  return {
    listRoots,
    listDirectory,
    previewFile,
    openDownloadFile,
    prepareDownloadDirectory,
    prepareDownloadSelection,
    revalidateDownloadDirectory,
    openDownloadArchiveFile,
  };
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

export function prepareFileBrowserDirectoryDownload(input: {
  rootId: string;
  segments: string[];
}) {
  return defaultFileBrowserService.prepareDownloadDirectory(input);
}

export function prepareFileBrowserSelectionDownload(input: {
  rootId: string;
  segments: string[];
  names: string[];
}) {
  return defaultFileBrowserService.prepareDownloadSelection(input);
}

export function revalidateFileBrowserDirectoryDownload(
  manifest: DownloadDirectoryManifest,
) {
  return defaultFileBrowserService.revalidateDownloadDirectory(manifest);
}

export function openFileBrowserArchiveEntry(
  manifest: DownloadDirectoryManifest,
  entry: DownloadDirectoryEntry,
) {
  return defaultFileBrowserService.openDownloadArchiveFile(manifest, entry);
}
