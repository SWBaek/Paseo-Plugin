import { request } from "node:http";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { inflateRawSync } from "node:zlib";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createFileBrowserService } from "./file-browser.server";
import {
  createFileDownloadServer,
  type FileDownloadServerOptions,
} from "./file-download.server";

interface ResponseResult {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: Buffer;
}

function readZipEntries(archive: Buffer): Map<string, Buffer> {
  const eocdSignature = Buffer.from([0x50, 0x4b, 0x05, 0x06]);
  const eocdOffset = archive.lastIndexOf(eocdSignature);
  if (eocdOffset < 0) throw new Error("ZIP footer not found");
  const entryCount = archive.readUInt16LE(eocdOffset + 10);
  let offset = archive.readUInt32LE(eocdOffset + 16);
  const entries = new Map<string, Buffer>();
  for (let index = 0; index < entryCount; index += 1) {
    if (archive.readUInt32LE(offset) !== 0x02014b50) throw new Error("Invalid central header");
    const method = archive.readUInt16LE(offset + 10);
    const compressedSize = archive.readUInt32LE(offset + 20);
    const nameLength = archive.readUInt16LE(offset + 28);
    const extraLength = archive.readUInt16LE(offset + 30);
    const commentLength = archive.readUInt16LE(offset + 32);
    const localOffset = archive.readUInt32LE(offset + 42);
    const name = archive.subarray(offset + 46, offset + 46 + nameLength).toString("utf8");
    const localNameLength = archive.readUInt16LE(localOffset + 26);
    const localExtraLength = archive.readUInt16LE(localOffset + 28);
    const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = archive.subarray(dataOffset, dataOffset + compressedSize);
    entries.set(name, method === 8 ? inflateRawSync(compressed) : Buffer.from(compressed));
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function localRequest(
  port: number,
  pathname: string,
  options: { identity?: boolean; method?: "GET" | "HEAD" } = {},
): Promise<ResponseResult> {
  return new Promise((resolve, reject) => {
    const req = request(
      {
        host: "127.0.0.1",
        port,
        path: pathname,
        method: options.method ?? "GET",
        headers: options.identity === false ? {} : { "Tailscale-User-Login": "owner@example.com" },
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("end", () => {
          resolve({
            status: response.statusCode ?? 0,
            headers: response.headers,
            body: Buffer.concat(chunks),
          });
        });
      },
    );
    req.on("error", reject);
    req.end();
  });
}

function abortAfterFirstChunk(port: number, pathname: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = request(
      {
        host: "127.0.0.1",
        port,
        path: pathname,
        method: "GET",
        headers: { "Tailscale-User-Login": "owner@example.com" },
      },
      (response) => {
        response.once("data", () => {
          response.destroy();
          resolve();
        });
      },
    );
    req.on("error", reject);
    req.end();
  });
}

describe("file download server", () => {
  let root: string;
  const running: Array<{ stop(): Promise<void> }> = [];

  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "file-download-root-"));
  });

  afterEach(async () => {
    await Promise.all(running.splice(0).map((server) => server.stop()));
    await rm(root, { recursive: true, force: true });
  });

  function server(options: {
    now?: () => number;
    tokenTtlMs?: number;
    streamArchive?: FileDownloadServerOptions["streamArchive"];
  } = {}) {
    const browser = createFileBrowserService({
      platform: "win32",
      roots: [{ id: "projects", label: "Projects", path: root }],
    });
    let tokenNumber = 0;
    const download = createFileDownloadServer({
      host: "127.0.0.1",
      port: 0,
      platform: "win32",
      createToken: () => `abcdefghijklmnopqrstuvwxyzABCDEFGH${String(tokenNumber++).padStart(8, "0")}`,
      openFile: browser.openDownloadFile,
      prepareDirectory: browser.prepareDownloadDirectory,
      revalidateDirectory: browser.revalidateDownloadDirectory,
      openArchiveFile: browser.openDownloadArchiveFile,
      resolvePublicBaseUrl: async () => "https://files.example.test:9292",
      ...options,
    });
    running.push(download);
    return download;
  }

  it("streams a regular file as a one-use attachment", async () => {
    const contents = Buffer.alloc(1024 * 1024, 0x61);
    await writeFile(path.join(root, "보고서.bin"), contents);
    const download = server();

    const issued = await download.issueDownload({
      rootId: "projects",
      segments: ["보고서.bin"],
    });
    const url = new URL(issued.url);
    const address = download.localAddress();
    expect(address).toMatchObject({ address: "127.0.0.1" });
    const port = address?.port;

    const response = await localRequest(port!, url.pathname);
    expect(response.status).toBe(200);
    expect(response.body).toEqual(contents);
    expect(response.headers["content-type"]).toBe("application/octet-stream");
    expect(response.headers["content-disposition"]).toContain("attachment;");
    expect(response.headers["content-disposition"]).toContain(encodeURIComponent("보고서.bin"));
    expect(response.headers["cache-control"]).toBe("no-store");

    const reused = await localRequest(port!, url.pathname);
    expect(reused.status).toBe(410);
  });

  it("requires Tailscale identity and does not consume the token for HEAD", async () => {
    await writeFile(path.join(root, "notes.txt"), "hello", "utf8");
    const download = server();
    const issued = await download.issueDownload({ rootId: "projects", segments: ["notes.txt"] });
    const url = new URL(issued.url);
    const port = download.localAddress()!.port;

    expect((await localRequest(port, url.pathname, { identity: false })).status).toBe(403);
    const head = await localRequest(port, url.pathname, { method: "HEAD" });
    expect(head.status).toBe(200);
    expect(head.body).toHaveLength(0);
    const get = await localRequest(port, url.pathname);
    expect(get.status).toBe(200);
    expect(get.body.toString("utf8")).toBe("hello");
  });

  it("rejects expired tokens", async () => {
    let clock = Date.now();
    await writeFile(path.join(root, "notes.txt"), "hello", "utf8");
    const download = server({ now: () => clock, tokenTtlMs: 60_000 });
    const issued = await download.issueDownload({ rootId: "projects", segments: ["notes.txt"] });
    const url = new URL(issued.url);
    clock += 60_001;

    expect((await localRequest(download.localAddress()!.port, url.pathname)).status).toBe(410);
  });

  it("validates sensitive files and directories before issuing a URL", async () => {
    await writeFile(path.join(root, ".env"), "SECRET=value", "utf8");
    await mkdir(path.join(root, "folder"));
    const download = server();

    await expect(
      download.issueDownload({ rootId: "projects", segments: [".env"] }),
    ).rejects.toThrow("민감 파일은 다운로드할 수 없습니다");
    await expect(
      download.issueDownload({ rootId: "projects", segments: ["folder"] }),
    ).rejects.toThrow("일반 파일만 다운로드할 수 있습니다");
    expect(download.localAddress()).toBeNull();
  });

  it("revalidates the file when the browser uses the URL", async () => {
    const file = path.join(root, "temporary.txt");
    await writeFile(file, "temporary", "utf8");
    const download = server();
    const issued = await download.issueDownload({
      rootId: "projects",
      segments: ["temporary.txt"],
    });
    const url = new URL(issued.url);
    const port = download.localAddress()!.port;
    await rm(file);

    expect((await localRequest(port, url.pathname)).status).toBe(404);
    expect((await localRequest(port, url.pathname)).status).toBe(410);
  });

  it("streams a nested directory as a UTF-8 ZIP attachment", async () => {
    await mkdir(path.join(root, "묶음", "빈 폴더"), { recursive: true });
    await mkdir(path.join(root, "묶음", "nested"), { recursive: true });
    await writeFile(path.join(root, "묶음", "안내.txt"), "안녕하세요", "utf8");
    await writeFile(path.join(root, "묶음", "nested", "data.json"), '{"ok":true}', "utf8");
    const download = server();

    const issued = await download.issueDirectoryDownload({
      rootId: "projects",
      segments: ["묶음"],
    });
    const url = new URL(issued.url);
    const response = await localRequest(download.localAddress()!.port, url.pathname);

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toBe("application/zip");
    expect(response.headers["content-length"]).toBeUndefined();
    expect(response.headers["content-disposition"]).toContain(encodeURIComponent("묶음.zip"));
    const entries = readZipEntries(response.body);
    expect([...entries.keys()]).toEqual([
      "묶음/",
      "묶음/nested/",
      "묶음/nested/data.json",
      "묶음/빈 폴더/",
      "묶음/안내.txt",
    ]);
    expect(entries.get("묶음/안내.txt")?.toString("utf8")).toBe("안녕하세요");
    expect(entries.get("묶음/nested/data.json")?.toString("utf8")).toBe('{"ok":true}');
  });

  it("rejects a directory with sensitive content before issuing a URL", async () => {
    await mkdir(path.join(root, "project"));
    await writeFile(path.join(root, "project", ".env"), "SECRET=value", "utf8");
    const download = server();

    await expect(
      download.issueDirectoryDownload({ rootId: "projects", segments: ["project"] }),
    ).rejects.toThrow("민감 파일 .env이 포함된 폴더는 다운로드할 수 없습니다");
    expect(download.localAddress()).toBeNull();
  });

  it("revalidates the directory manifest before streaming", async () => {
    await mkdir(path.join(root, "project"));
    await writeFile(path.join(root, "project", "before.txt"), "before", "utf8");
    const download = server();
    const issued = await download.issueDirectoryDownload({
      rootId: "projects",
      segments: ["project"],
    });
    const url = new URL(issued.url);
    const port = download.localAddress()!.port;
    await writeFile(path.join(root, "project", "after.txt"), "after", "utf8");

    expect((await localRequest(port, url.pathname)).status).toBe(404);
    expect((await localRequest(port, url.pathname)).status).toBe(410);
  });

  it("allows only one active directory archive without consuming the waiting token", async () => {
    await mkdir(path.join(root, "first"));
    await mkdir(path.join(root, "second"));
    let releaseArchive!: () => void;
    let markStarted!: () => void;
    const started = new Promise<void>((resolve) => { markStarted = resolve; });
    const released = new Promise<void>((resolve) => { releaseArchive = resolve; });
    let calls = 0;
    const download = server({
      streamArchive: async ({ destination }) => {
        calls += 1;
        if (calls === 1) {
          markStarted();
          await released;
        }
        destination.write(Buffer.from("archive"));
      },
    });
    const first = await download.issueDirectoryDownload({ rootId: "projects", segments: ["first"] });
    const second = await download.issueDirectoryDownload({ rootId: "projects", segments: ["second"] });
    const port = download.localAddress()!.port;

    const firstRequest = localRequest(port, new URL(first.url).pathname);
    await started;
    expect((await localRequest(port, new URL(second.url).pathname)).status).toBe(409);
    releaseArchive();
    expect((await firstRequest).status).toBe(200);
    expect((await localRequest(port, new URL(second.url).pathname)).status).toBe(200);
  });

  it("releases the active archive slot when the client cancels the transfer", async () => {
    await mkdir(path.join(root, "first"));
    await mkdir(path.join(root, "second"));
    let calls = 0;
    const download = server({
      streamArchive: async ({ destination }) => {
        calls += 1;
        destination.write(Buffer.from("archive"));
        if (calls !== 1 || destination.destroyed) return;
        await new Promise<void>((resolve) => destination.once("close", resolve));
      },
    });
    const first = await download.issueDirectoryDownload({ rootId: "projects", segments: ["first"] });
    const second = await download.issueDirectoryDownload({ rootId: "projects", segments: ["second"] });
    const port = download.localAddress()!.port;

    await abortAfterFirstChunk(port, new URL(first.url).pathname);
    await new Promise((resolve) => setTimeout(resolve, 25));

    expect((await localRequest(port, new URL(second.url).pathname)).status).toBe(200);
  });
});
