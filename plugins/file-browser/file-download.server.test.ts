import { request } from "node:http";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createFileBrowserService } from "./file-browser.server";
import { createFileDownloadServer } from "./file-download.server";

interface ResponseResult {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: Buffer;
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

  function server(options: { now?: () => number; tokenTtlMs?: number } = {}) {
    const browser = createFileBrowserService({
      platform: "win32",
      roots: [{ id: "projects", label: "Projects", path: root }],
    });
    const download = createFileDownloadServer({
      host: "127.0.0.1",
      port: 0,
      platform: "win32",
      createToken: () => "abcdefghijklmnopqrstuvwxyzABCDEFGH12345678",
      openFile: browser.openDownloadFile,
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
});
