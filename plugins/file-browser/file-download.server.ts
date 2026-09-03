import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { promisify } from "node:util";
import {
  FILE_DOWNLOAD_TOKEN_TTL_MS,
} from "./file-browser.shared";
import {
  openFileBrowserArchiveEntry,
  openFileBrowserDownload,
  prepareFileBrowserDirectoryDownload,
  prepareFileBrowserSelectionDownload,
  revalidateFileBrowserDirectoryDownload,
  type DownloadDirectoryEntry,
  type DownloadDirectoryManifest,
  type OpenedDownloadFile,
} from "./file-browser.server";
import { streamZipArchive } from "./zip-archive.server";

export const FILE_DOWNLOAD_HOST = "127.0.0.1";
export const FILE_DOWNLOAD_PORT = 9292;

interface DownloadTargetBase {
  kind: "file" | "directory";
  rootId: string;
  segments: string[];
  expiresAt: number;
  timeout: NodeJS.Timeout;
}

interface FileDownloadTarget extends DownloadTargetBase {
  kind: "file";
}

interface DirectoryDownloadTarget extends DownloadTargetBase {
  kind: "directory";
  manifest: DownloadDirectoryManifest;
}

type DownloadTarget = FileDownloadTarget | DirectoryDownloadTarget;
type PreparedDownloadTarget =
  | Omit<FileDownloadTarget, "expiresAt" | "timeout">
  | Omit<DirectoryDownloadTarget, "expiresAt" | "timeout">;

interface TailscaleStatus {
  BackendState?: string;
  Self?: { DNSName?: string };
}

interface TailscaleServeStatus {
  TCP?: Record<string, { HTTPS?: boolean }>;
  Web?: Record<string, { Handlers?: Record<string, { Proxy?: string }> }>;
}

export interface FileDownloadServerOptions {
  host?: string;
  port?: number;
  tokenTtlMs?: number;
  now?: () => number;
  createToken?: () => string;
  openFile: (input: { rootId: string; segments: string[] }) => Promise<OpenedDownloadFile>;
  prepareDirectory?: (input: {
    rootId: string;
    segments: string[];
  }) => Promise<DownloadDirectoryManifest>;
  prepareSelection?: (input: {
    rootId: string;
    segments: string[];
    names: string[];
  }) => Promise<DownloadDirectoryManifest>;
  revalidateDirectory?: (
    manifest: DownloadDirectoryManifest,
  ) => Promise<DownloadDirectoryManifest>;
  openArchiveFile?: (
    manifest: DownloadDirectoryManifest,
    entry: DownloadDirectoryEntry,
  ) => Promise<OpenedDownloadFile>;
  streamArchive?: typeof streamZipArchive;
  resolvePublicBaseUrl: () => Promise<string>;
  requireTailscaleIdentity?: boolean;
  platform?: NodeJS.Platform;
}

const execFileAsync = promisify(execFile);

function publicError(message: string): Error {
  return new Error(message);
}

function sendText(response: ServerResponse, status: number, message: string): void {
  if (response.headersSent) {
    response.destroy();
    return;
  }
  const body = Buffer.from(message, "utf8");
  response.writeHead(status, {
    "Cache-Control": "no-store",
    "Content-Length": String(body.length),
    "Content-Type": "text/plain; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(body);
}

function attachmentDisposition(name: string): string {
  const fallback = name.replace(/[^\x20-\x7e]|["\\]/g, "_") || "download";
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

export async function resolveTailscaleDownloadBaseUrl(
  port = FILE_DOWNLOAD_PORT,
): Promise<string> {
  let status: TailscaleStatus;
  let serve: TailscaleServeStatus;
  try {
    const [statusResult, serveResult] = await Promise.all([
      execFileAsync("tailscale", ["status", "--json"], {
        timeout: 5_000,
        windowsHide: true,
        maxBuffer: 2 * 1024 * 1024,
      }),
      execFileAsync("tailscale", ["serve", "status", "--json"], {
        timeout: 5_000,
        windowsHide: true,
        maxBuffer: 2 * 1024 * 1024,
      }),
    ]);
    status = JSON.parse(statusResult.stdout) as TailscaleStatus;
    serve = JSON.parse(serveResult.stdout) as TailscaleServeStatus;
  } catch {
    throw publicError("Tailscale 상태를 확인할 수 없습니다.");
  }

  const dnsName = status.Self?.DNSName?.replace(/\.$/, "");
  if (status.BackendState !== "Running" || !dnsName) {
    throw publicError("이 Host에서 Tailscale이 연결되어 있지 않습니다.");
  }

  const publicKey = `${dnsName}:${port}`;
  const proxy = serve.Web?.[publicKey]?.Handlers?.["/"]?.Proxy;
  if (serve.TCP?.[String(port)]?.HTTPS !== true || proxy !== `http://${FILE_DOWNLOAD_HOST}:${port}`) {
    throw publicError(`Tailscale Serve HTTPS ${port}가 다운로드 서버에 연결되어 있지 않습니다.`);
  }
  return `https://${publicKey}`;
}

export function createFileDownloadServer(options: FileDownloadServerOptions) {
  const host = options.host ?? FILE_DOWNLOAD_HOST;
  const port = options.port ?? FILE_DOWNLOAD_PORT;
  const ttlMs = options.tokenTtlMs ?? FILE_DOWNLOAD_TOKEN_TTL_MS;
  const now = options.now ?? Date.now;
  const createToken = options.createToken ?? (() => randomBytes(32).toString("base64url"));
  const requireTailscaleIdentity = options.requireTailscaleIdentity ?? true;
  const platform = options.platform ?? process.platform;
  const streamArchive = options.streamArchive ?? streamZipArchive;
  const targets = new Map<string, DownloadTarget>();
  let server: Server | null = null;
  let startPromise: Promise<void> | null = null;
  let activeTransfers = 0;
  let activeArchiveTransfers = 0;
  let idleTimer: NodeJS.Timeout | null = null;

  async function ensureStarted(): Promise<void> {
    if (idleTimer) {
      clearTimeout(idleTimer);
      idleTimer = null;
    }
    if (server?.listening) return;
    if (startPromise) return startPromise;

    const nextServer = createServer((request, response) => {
      void handleRequest(request, response).catch(() => {
        sendText(response, 500, "다운로드 요청을 처리할 수 없습니다.");
      });
    });
    nextServer.on("clientError", (_error, socket) => {
      socket.end("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n");
    });
    server = nextServer;
    startPromise = new Promise<void>((resolve, reject) => {
      const onError = (error: Error) => {
        nextServer.off("listening", onListening);
        server = null;
        reject(error);
      };
      const onListening = () => {
        nextServer.off("error", onError);
        resolve();
      };
      nextServer.once("error", onError);
      nextServer.once("listening", onListening);
      nextServer.listen(port, host);
    }).finally(() => {
      startPromise = null;
    });
    try {
      await startPromise;
    } catch {
      throw publicError(`다운로드 서버 포트 ${port}를 열 수 없습니다.`);
    }
  }

  function removeToken(token: string): DownloadTarget | undefined {
    const target = targets.get(token);
    if (!target) return undefined;
    targets.delete(token);
    clearTimeout(target.timeout);
    return target;
  }

  function stopIfIdle(): void {
    if (targets.size !== 0 || activeTransfers !== 0 || !server || idleTimer) return;
    idleTimer = setTimeout(() => {
      idleTimer = null;
      if (targets.size !== 0 || activeTransfers !== 0 || !server) return;
      const idleServer = server;
      server = null;
      idleServer.close();
    }, ttlMs);
    idleTimer.unref();
  }

  function requireWindows(): void {
    if (platform !== "win32") {
      throw publicError("파일 다운로드는 Windows daemon에서만 사용할 수 있습니다.");
    }
  }

  async function registerDownload(
    target: PreparedDownloadTarget,
  ): Promise<{ url: string; expiresAt: string }> {
    let baseUrl: string;
    try {
      const parsed = new URL(await options.resolvePublicBaseUrl());
      if (parsed.protocol !== "https:" || parsed.username || parsed.password) throw new Error();
      parsed.pathname = "/";
      parsed.search = "";
      parsed.hash = "";
      baseUrl = parsed.toString().replace(/\/$/, "");
    } catch (error) {
      if (error instanceof Error && error.message) throw error;
      throw publicError("다운로드 HTTPS 주소를 확인할 수 없습니다.");
    }

    await ensureStarted();

    const token = createToken();
    if (!/^[A-Za-z0-9_-]{32,}$/.test(token) || targets.has(token)) {
      stopIfIdle();
      throw publicError("안전한 다운로드 주소를 만들 수 없습니다.");
    }
    const expiresAt = now() + ttlMs;
    const timeout = setTimeout(() => {
      removeToken(token);
      stopIfIdle();
    }, ttlMs);
    timeout.unref();
    targets.set(token, {
      ...target,
      expiresAt,
      timeout,
    } as DownloadTarget);
    return {
      url: `${baseUrl}/download/${token}`,
      expiresAt: new Date(expiresAt).toISOString(),
    };
  }

  async function issueDownload(input: {
    rootId: string;
    segments: string[];
  }): Promise<{ url: string; expiresAt: string }> {
    requireWindows();
    const verified = await options.openFile({
      rootId: input.rootId,
      segments: [...input.segments],
    });
    await verified.handle.close();
    return registerDownload({
      kind: "file",
      rootId: input.rootId,
      segments: [...input.segments],
    });
  }

  async function issueDirectoryDownload(input: {
    rootId: string;
    segments: string[];
  }): Promise<{ url: string; expiresAt: string }> {
    requireWindows();
    if (!options.prepareDirectory || !options.revalidateDirectory || !options.openArchiveFile) {
      throw publicError("폴더 다운로드를 사용할 수 없습니다.");
    }
    const manifest = await options.prepareDirectory({
      rootId: input.rootId,
      segments: [...input.segments],
    });
    return registerDownload({
      kind: "directory",
      rootId: input.rootId,
      segments: [...input.segments],
      manifest,
    });
  }

  async function issueSelectionDownload(input: {
    rootId: string;
    segments: string[];
    names: string[];
  }): Promise<{ url: string; expiresAt: string }> {
    requireWindows();
    if (!options.prepareSelection || !options.revalidateDirectory || !options.openArchiveFile) {
      throw publicError("선택 항목 다운로드를 사용할 수 없습니다.");
    }
    const manifest = await options.prepareSelection({
      rootId: input.rootId,
      segments: [...input.segments],
      names: [...input.names],
    });
    return registerDownload({
      kind: "directory",
      rootId: input.rootId,
      segments: [...input.segments],
      manifest,
    });
  }

  async function handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
    if (requireTailscaleIdentity) {
      const identity = request.headers["tailscale-user-login"];
      if (typeof identity !== "string" || identity.length === 0) {
        sendText(response, 403, "Tailnet 인증이 필요합니다.");
        return;
      }
    }
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.setHeader("Allow", "GET, HEAD");
      sendText(response, 405, "지원하지 않는 요청입니다.");
      return;
    }

    const requestUrl = new URL(request.url ?? "/", "http://localhost");
    const match = /^\/download\/([A-Za-z0-9_-]{32,})$/.exec(requestUrl.pathname);
    if (!match || requestUrl.search) {
      sendText(response, 404, "다운로드 주소를 찾을 수 없습니다.");
      return;
    }

    const token = match[1];
    const candidate = targets.get(token);
    if (!candidate || candidate.expiresAt <= now()) {
      removeToken(token);
      stopIfIdle();
      sendText(response, 410, "다운로드 주소가 만료되었거나 이미 사용되었습니다.");
      return;
    }

    const isGet = request.method === "GET";
    if (isGet && candidate.kind === "directory" && activeArchiveTransfers !== 0) {
      sendText(response, 409, "다른 폴더 ZIP 다운로드가 진행 중입니다. 완료 후 다시 시도하세요.");
      return;
    }

    const target = isGet ? removeToken(token) : candidate;
    if (!target) {
      sendText(response, 410, "다운로드 주소가 만료되었거나 이미 사용되었습니다.");
      return;
    }

    let finished = false;
    const finish = () => {
      if (finished || !isGet) return;
      finished = true;
      activeTransfers -= 1;
      if (target.kind === "directory") activeArchiveTransfers -= 1;
      stopIfIdle();
    };
    if (isGet) {
      activeTransfers += 1;
      if (target.kind === "directory") activeArchiveTransfers += 1;
    }

    if (target.kind === "directory") {
      try {
        const manifest = await options.revalidateDirectory!(target.manifest);
        response.setHeader("Cache-Control", "no-store");
        response.setHeader("Content-Disposition", attachmentDisposition(`${manifest.name}.zip`));
        response.setHeader("Content-Security-Policy", "default-src 'none'");
        response.setHeader("Content-Type", "application/zip");
        response.setHeader("X-Content-Type-Options", "nosniff");
        if (!isGet) {
          response.writeHead(200);
          response.end();
          return;
        }

        response.writeHead(200);
        await streamArchive({
          entries: manifest.entries,
          destination: response,
          openFile: (entry) =>
            options.openArchiveFile!(manifest, entry as DownloadDirectoryEntry),
        });
        response.end();
      } catch {
        sendText(response, 404, "폴더를 더 이상 다운로드할 수 없습니다. 다시 시도하세요.");
      } finally {
        finish();
      }
      return;
    }

    let opened: OpenedDownloadFile;
    try {
      opened = await options.openFile({
        rootId: target.rootId,
        segments: [...target.segments],
      });
    } catch {
      finish();
      stopIfIdle();
      sendText(response, 404, "파일을 더 이상 다운로드할 수 없습니다.");
      return;
    }

    response.setHeader("Cache-Control", "no-store");
    response.setHeader("Content-Disposition", attachmentDisposition(opened.name));
    response.setHeader("Content-Length", String(opened.sizeBytes));
    response.setHeader("Content-Security-Policy", "default-src 'none'");
    response.setHeader("Content-Type", "application/octet-stream");
    response.setHeader("X-Content-Type-Options", "nosniff");
    if (!isGet) {
      await opened.handle.close();
      response.writeHead(200);
      response.end();
      return;
    }

    const stream = opened.handle.createReadStream({ autoClose: true });
    response.on("close", () => {
      stream.destroy();
      finish();
    });
    stream.on("error", () => {
      response.destroy();
      finish();
    });
    stream.on("end", finish);
    response.writeHead(200);
    stream.pipe(response);
  }

  async function stop(): Promise<void> {
    for (const token of [...targets.keys()]) removeToken(token);
    if (idleTimer) {
      clearTimeout(idleTimer);
      idleTimer = null;
    }
    if (!server) return;
    const current = server;
    server = null;
    current.closeAllConnections?.();
    await new Promise<void>((resolve) => current.close(() => resolve()));
  }

  function localAddress(): { address: string; port: number } | null {
    const address = server?.address();
    return address && typeof address !== "string"
      ? { address: address.address, port: address.port }
      : null;
  }

  return { issueDownload, issueDirectoryDownload, issueSelectionDownload, localAddress, stop };
}

const defaultFileDownloadServer = createFileDownloadServer({
  openFile: openFileBrowserDownload,
  prepareDirectory: prepareFileBrowserDirectoryDownload,
  prepareSelection: prepareFileBrowserSelectionDownload,
  revalidateDirectory: revalidateFileBrowserDirectoryDownload,
  openArchiveFile: openFileBrowserArchiveEntry,
  resolvePublicBaseUrl: () => resolveTailscaleDownloadBaseUrl(),
});

export function createFileBrowserDownload(input: {
  rootId: string;
  segments: string[];
}) {
  return defaultFileDownloadServer.issueDownload(input);
}

export function createFileBrowserDirectoryDownload(input: {
  rootId: string;
  segments: string[];
}) {
  return defaultFileDownloadServer.issueDirectoryDownload(input);
}

export function createFileBrowserSelectionDownload(input: {
  rootId: string;
  segments: string[];
  names: string[];
}) {
  return defaultFileDownloadServer.issueSelectionDownload(input);
}

export function stopFileBrowserDownloads() {
  return defaultFileDownloadServer.stop();
}
