import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  DirectoryPageSchema,
  FILE_BROWSER_PAGE_SIZE,
  FILE_PREVIEW_LIMIT_BYTES,
  FilePreviewSchema,
} from "./file-browser.shared";
import {
  createFileBrowserService,
  isSensitiveFileName,
  validatePathSegment,
} from "./file-browser.server";

const execFileAsync = promisify(execFile);

describe("file-browser server", () => {
  let root: string;
  let outside: string;

  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "file-browser-root-"));
    outside = await mkdtemp(path.join(os.tmpdir(), "file-browser-outside-"));
  });

  afterEach(async () => {
    await Promise.all([
      rm(root, { recursive: true, force: true }),
      rm(outside, { recursive: true, force: true }),
    ]);
  });

  function service() {
    return createFileBrowserService({
      platform: "win32",
      roots: [{ id: "projects", label: "Projects", path: root }],
    });
  }

  it("exposes only configured roots and lists nested directories", async () => {
    await mkdir(path.join(root, "alpha"));
    await writeFile(path.join(root, "notes.txt"), "hello", "utf8");

    const roots = await service().listRoots();
    const page = await service().listDirectory({ rootId: "projects", segments: [], cursor: null });

    expect(roots.roots).toEqual([
      { id: "projects", label: "Projects", path: root, available: true },
    ]);
    expect(page.entries.map(({ name, kind }) => ({ name, kind }))).toEqual([
      { name: "alpha", kind: "directory" },
      { name: "notes.txt", kind: "file" },
    ]);
    expect(() => DirectoryPageSchema.parse(page)).not.toThrow();
  });

  it("rejects unknown roots and Windows path escape syntax", async () => {
    const browser = service();

    await expect(
      browser.listDirectory({ rootId: "unknown", segments: [], cursor: null }),
    ).rejects.toThrow("허용되지 않은 파일 루트");

    for (const segment of [
      "..",
      ".",
      "folder\\escape",
      "folder/escape",
      "C:",
      "file:stream",
      "bad*name",
      "bad|name",
      "NUL",
      "name.",
      "name ",
      "\0",
    ]) {
      expect(() => validatePathSegment(segment)).toThrow("허용되지 않는 Windows 경로 이름");
    }
  });

  it("shows a junction but refuses to traverse or preview it", async () => {
    await writeFile(path.join(outside, "secret.txt"), "outside", "utf8");
    await symlink(outside, path.join(root, "outside-link"), "junction");
    const browser = service();

    const page = await browser.listDirectory({ rootId: "projects", segments: [], cursor: null });
    expect(page.entries).toContainEqual({
      name: "outside-link",
      kind: "link",
      previewStatus: "unsupported",
      archiveStatus: "blocked",
    });
    await expect(
      browser.listDirectory({ rootId: "projects", segments: ["outside-link"], cursor: null }),
    ).rejects.toThrow("링크와 junction은 열 수 없습니다");
    await expect(
      browser.previewFile({ rootId: "projects", segments: ["outside-link"] }),
    ).rejects.toThrow("링크와 junction은 열 수 없습니다");
  });

  it("paginates 200 entries with folders before files and stable natural names", async () => {
    await mkdir(path.join(root, "folder-10"));
    await mkdir(path.join(root, "folder-2"));
    await Promise.all(
      Array.from({ length: FILE_BROWSER_PAGE_SIZE + 3 }, (_, index) =>
        writeFile(path.join(root, `file-${String(index).padStart(3, "0")}.txt`), "x", "utf8"),
      ),
    );
    const browser = service();

    const first = await browser.listDirectory({ rootId: "projects", segments: [], cursor: null });
    const second = await browser.listDirectory({
      rootId: "projects",
      segments: [],
      cursor: first.pageInfo.nextCursor,
    });

    expect(first.entries).toHaveLength(FILE_BROWSER_PAGE_SIZE);
    expect(first.entries.slice(0, 2).map((entry) => entry.name)).toEqual(["folder-2", "folder-10"]);
    expect(first.pageInfo).toEqual({ hasMore: true, nextCursor: "200" });
    expect(second.entries).toHaveLength(5);
    expect(second.pageInfo).toEqual({ hasMore: false, nextCursor: null });
    await expect(
      browser.listDirectory({ rootId: "projects", segments: [], cursor: "9999" }),
    ).rejects.toThrow("폴더 페이지 위치가 올바르지 않습니다");
  });

  it("previews UTF-8 and BOM-marked UTF-16 text", async () => {
    await writeFile(path.join(root, "utf8.txt"), "안녕하세요", "utf8");
    await writeFile(
      path.join(root, "utf16.txt"),
      Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from("hello", "utf16le")]),
    );
    await writeFile(
      path.join(root, "utf16be.txt"),
      Buffer.from([0xfe, 0xff, 0x00, 0x77, 0x00, 0x6f, 0x00, 0x72, 0x00, 0x6c, 0x00, 0x64]),
    );
    const browser = service();

    const utf8 = await browser.previewFile({ rootId: "projects", segments: ["utf8.txt"] });
    const utf16 = await browser.previewFile({ rootId: "projects", segments: ["utf16.txt"] });
    const utf16be = await browser.previewFile({
      rootId: "projects",
      segments: ["utf16be.txt"],
    });

    expect(utf8).toMatchObject({ content: "안녕하세요", encoding: "utf-8", truncated: false });
    expect(utf16).toMatchObject({ content: "hello", encoding: "utf-16le", truncated: false });
    expect(utf16be).toMatchObject({ content: "world", encoding: "utf-16be", truncated: false });
    expect(() => FilePreviewSchema.parse(utf8)).not.toThrow();
    expect(() => FilePreviewSchema.parse(utf16)).not.toThrow();
    expect(() => FilePreviewSchema.parse(utf16be)).not.toThrow();
  });

  it("limits previews to 64 KiB without failing on a split UTF-8 character", async () => {
    const prefix = Buffer.alloc(FILE_PREVIEW_LIMIT_BYTES - 1, 0x61);
    await writeFile(path.join(root, "large.txt"), Buffer.concat([prefix, Buffer.from("가나다")]));

    const preview = await service().previewFile({
      rootId: "projects",
      segments: ["large.txt"],
    });

    expect(preview.truncated).toBe(true);
    expect(Buffer.byteLength(preview.content, "utf8")).toBeLessThanOrEqual(FILE_PREVIEW_LIMIT_BYTES);
    expect(preview.content.startsWith("aaa")).toBe(true);
  });

  it("blocks sensitive names and binary content", async () => {
    await writeFile(path.join(root, ".env.production"), "TOKEN=secret", "utf8");
    await writeFile(path.join(root, "binary.dat"), Buffer.from([0x00, 0x01, 0x02]));
    const browser = service();
    const page = await browser.listDirectory({ rootId: "projects", segments: [], cursor: null });

    expect(page.entries.find((entry) => entry.name === ".env.production")?.previewStatus).toBe(
      "sensitive",
    );
    await expect(
      browser.previewFile({ rootId: "projects", segments: [".env.production"] }),
    ).rejects.toThrow("민감 파일은 미리 볼 수 없습니다");
    await expect(
      browser.previewFile({ rootId: "projects", segments: ["binary.dat"] }),
    ).rejects.toThrow("바이너리 파일은 미리 볼 수 없습니다");
  });

  it("recognizes the agreed sensitive filename set", () => {
    for (const name of [
      ".env",
      ".env.local",
      "private.PEM",
      "client.key",
      "id_rsa",
      "id_ed25519",
      ".npmrc",
      ".pypirc",
      "credentials",
      "credentials.json",
    ]) {
      expect(isSensitiveFileName(name)).toBe(true);
    }
    expect(isSensitiveFileName("README.md")).toBe(false);
  });

  it("prepares a bounded manifest with a containing root and empty directories", async () => {
    await mkdir(path.join(root, "bundle", "빈 폴더"), { recursive: true });
    await mkdir(path.join(root, "bundle", "node_modules"), { recursive: true });
    await writeFile(path.join(root, "bundle", "문서.txt"), "content", "utf8");
    await writeFile(path.join(root, "bundle", "debug.log"), "noise", "utf8");
    await writeFile(path.join(root, "bundle", "node_modules", "dependency.js"), "noise", "utf8");

    const manifest = await service().prepareDownloadDirectory({
      rootId: "projects",
      segments: ["bundle"],
    });

    expect(manifest.name).toBe("bundle");
    expect(manifest.totalSizeBytes).toBe(7);
    expect(manifest.entries.map(({ kind, archivePath }) => ({ kind, archivePath }))).toEqual([
      { kind: "directory", archivePath: "bundle" },
      { kind: "directory", archivePath: "bundle/빈 폴더" },
      { kind: "file", archivePath: "bundle/문서.txt" },
    ]);
  });

  it("uses standard Git excludes without changing repository state", async () => {
    const repository = path.join(root, "repository");
    const globalExcludes = path.join(outside, "global-excludes");
    await mkdir(repository);
    await execFileAsync("git", ["-C", repository, "init"]);
    await execFileAsync("git", ["-C", repository, "config", "core.excludesFile", globalExcludes]);
    await writeFile(path.join(repository, ".gitignore"), "ignored.txt\nnode_modules/\n.env\n", "utf8");
    await writeFile(path.join(repository, ".git", "info", "exclude"), "info-only.txt\n", "utf8");
    await writeFile(globalExcludes, "global-only.bin\n", "utf8");
    await writeFile(path.join(repository, "included.txt"), "included", "utf8");
    await writeFile(path.join(repository, "ignored.txt"), "ignored", "utf8");
    await writeFile(path.join(repository, "info-only.txt"), "ignored", "utf8");
    await writeFile(path.join(repository, "global-only.bin"), "ignored", "utf8");
    await writeFile(path.join(repository, ".env"), "SECRET=ignored", "utf8");
    await mkdir(path.join(repository, "node_modules"));
    await writeFile(path.join(repository, "node_modules", "dependency.js"), "ignored", "utf8");
    await execFileAsync("git", ["-C", repository, "add", "--", ".gitignore", "included.txt"]);
    const before = (await execFileAsync("git", ["-C", repository, "status", "--porcelain=v1"])).stdout;

    const manifest = await service().prepareDownloadDirectory({
      rootId: "projects",
      segments: ["repository"],
    });
    const after = (await execFileAsync("git", ["-C", repository, "status", "--porcelain=v1"])).stdout;

    expect(manifest.entries.map((entry) => entry.archivePath)).toEqual([
      "repository",
      "repository/.gitignore",
      "repository/included.txt",
    ]);
    expect(after).toBe(before);

    await execFileAsync("git", ["-C", repository, "add", "-f", "--", ".env"]);
    await expect(
      service().prepareDownloadDirectory({ rootId: "projects", segments: ["repository"] }),
    ).rejects.toThrow("민감 파일 .env이 포함된 폴더는 다운로드할 수 없습니다");
  });

  it("prepares a filtered ZIP manifest for selected sibling files and folders", async () => {
    await mkdir(path.join(root, "project", "node_modules"), { recursive: true });
    await writeFile(path.join(root, "project", "source.ts"), "source", "utf8");
    await writeFile(path.join(root, "project", "node_modules", "dependency.js"), "noise", "utf8");
    await writeFile(path.join(root, "explicit.log"), "chosen", "utf8");

    const manifest = await service().prepareDownloadSelection({
      rootId: "projects",
      segments: [],
      names: ["project", "explicit.log"],
    });

    expect(manifest.name).toBe("Projects-selection");
    expect(manifest.selectionNames).toEqual(["explicit.log", "project"]);
    expect(manifest.entries.map((entry) => entry.archivePath)).toEqual([
      "explicit.log",
      "project",
      "project/source.ts",
    ]);
    await expect(
      service().prepareDownloadSelection({
        rootId: "projects",
        segments: ["project"],
        names: ["node_modules"],
      }),
    ).rejects.toThrow("ZIP 기본 제외 대상");
  });

  it("refuses the allowlisted root and junctions for directory downloads", async () => {
    await mkdir(path.join(root, "bundle"));
    await symlink(outside, path.join(root, "bundle", "outside-link"), "junction");
    const browser = service();

    await expect(
      browser.prepareDownloadDirectory({ rootId: "projects", segments: [] }),
    ).rejects.toThrow("루트 전체는 다운로드할 수 없습니다");
    await expect(
      browser.prepareDownloadDirectory({ rootId: "projects", segments: ["bundle"] }),
    ).rejects.toThrow("링크와 junction이 포함된 폴더는 다운로드할 수 없습니다");
  });

  it("enforces directory entry, byte, and depth limits", async () => {
    await mkdir(path.join(root, "bundle", "nested"), { recursive: true });
    await writeFile(path.join(root, "bundle", "nested", "data.bin"), "1234", "utf8");

    const entriesLimited = createFileBrowserService({
      platform: "win32",
      roots: [{ id: "projects", label: "Projects", path: root }],
      directoryDownloadLimits: { maxEntries: 1 },
    });
    const bytesLimited = createFileBrowserService({
      platform: "win32",
      roots: [{ id: "projects", label: "Projects", path: root }],
      directoryDownloadLimits: { maxBytes: 3 },
    });
    const depthLimited = createFileBrowserService({
      platform: "win32",
      roots: [{ id: "projects", label: "Projects", path: root }],
      directoryDownloadLimits: { maxDepth: 1 },
    });

    await expect(
      entriesLimited.prepareDownloadDirectory({ rootId: "projects", segments: ["bundle"] }),
    ).rejects.toThrow("최대 1개");
    await expect(
      bytesLimited.prepareDownloadDirectory({ rootId: "projects", segments: ["bundle"] }),
    ).rejects.toThrow("최대 2 GiB");
    await expect(
      depthLimited.prepareDownloadDirectory({ rootId: "projects", segments: ["bundle"] }),
    ).rejects.toThrow("최대 1단계");
  });

  it("refuses to run on non-Windows daemons", async () => {
    const browser = createFileBrowserService({
      platform: "linux",
      roots: [{ id: "projects", label: "Projects", path: root }],
    });
    await expect(browser.listRoots()).rejects.toThrow("Windows daemon에서만");
  });
});
