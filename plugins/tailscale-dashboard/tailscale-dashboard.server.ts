import { execFile } from "node:child_process";
import { z } from "zod";
import type {
  DashboardDiscoveryResult,
  DashboardHealth,
  DashboardSnapshot,
} from "./tailscale-dashboard.shared";

const COMMAND_TIMEOUT_MS = 10_000;
const COMMAND_MAX_BUFFER_BYTES = 2 * 1024 * 1024;
const PROBE_TIMEOUT_MS = 5_000;
const PROBE_MAX_BYTES = 512 * 1024;
const MAX_CANDIDATES = 16;

const TailscaleStatusSchema = z
  .object({
    BackendState: z.string(),
    Self: z
      .object({
        Online: z.boolean().optional(),
        DNSName: z.string().optional(),
      })
      .nullable()
      .optional(),
  })
  .loose();

const TailscaleOpsStatusSchema = z
  .object({
    generatedAt: z.string(),
    refreshIntervalSeconds: z.number(),
    overall: z.object({
      status: z.enum(["healthy", "warning", "error"]),
      message: z.string(),
    }),
    device: z
      .object({
        name: z.string(),
        os: z.string(),
        online: z.boolean(),
        version: z.string().nullable(),
      })
      .loose(),
    summary: z
      .object({
        onlinePeers: z.number(),
        totalPeers: z.number(),
        funnelIngressPeers: z.object({ online: z.number(), total: z.number() }),
        serveServices: z.number(),
        funnelEnabled: z.boolean(),
      })
      .loose(),
    protectedServices: z.array(
      z
        .object({
          name: z.string(),
          mode: z.string(),
          listenerHealthy: z.boolean(),
          backendHealthy: z.boolean().nullable(),
          status: z.enum(["healthy", "warning", "error"]),
          detail: z.string(),
        })
        .loose(),
    ),
    peers: z.array(
      z
        .object({
          name: z.string(),
          os: z.string(),
          online: z.boolean(),
          lastSeen: z.string().nullable(),
          connection: z.string(),
          relay: z.string().nullable(),
          latencyMs: z.number().nullable(),
        })
        .loose(),
    ),
    warnings: z.array(
      z
        .object({
          severity: z.enum(["warning", "error"]),
          title: z.string(),
          detail: z.string(),
        })
        .loose(),
    ),
    serve: z.array(z.unknown()),
  })
  .loose();

export interface TailscaleCommandResult {
  stdout: string;
  stderr: string;
}

export interface TailscaleProcessOptions {
  env: NodeJS.ProcessEnv;
  encoding: "utf8";
  timeout: number;
  maxBuffer: number;
  windowsHide: true;
  shell: false;
}

export type TailscaleProcessExecutor = (
  file: string,
  args: readonly string[],
  options: TailscaleProcessOptions,
) => Promise<TailscaleCommandResult>;

export type TailscaleRunner = (
  args: readonly string[],
) => Promise<TailscaleCommandResult>;

export type DashboardFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export interface DashboardDiscoveryOptions {
  runTailscale?: TailscaleRunner;
  fetchImpl?: DashboardFetch;
  now?: () => Date;
  probeTimeoutMs?: number;
}

interface ServeCandidate {
  publicUrl: string;
  statusUrl: string;
}

interface ProbeResult {
  candidate: ServeCandidate;
  health: DashboardHealth | null;
  dashboard: DashboardSnapshot | null;
  outcome: "verified" | "timeout" | "failed";
}

function executeTailscaleProcess(
  file: string,
  args: readonly string[],
  options: TailscaleProcessOptions,
): Promise<TailscaleCommandResult> {
  return new Promise((resolve, reject) => {
    execFile(file, [...args], options, (error, stdout, stderr) => {
      if (error) {
        reject(error);
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

export function assertReadOnlyTailscaleArgs(args: readonly string[]): void {
  const allowed =
    (args.length === 2 && args[0] === "status" && args[1] === "--json") ||
    (args.length === 3 &&
      args[0] === "serve" &&
      args[1] === "status" &&
      args[2] === "--json");

  if (!allowed) {
    throw new Error("Blocked non-read-only Tailscale command.");
  }
}

export function createTailscaleRunner(
  executor: TailscaleProcessExecutor = executeTailscaleProcess,
): TailscaleRunner {
  return async (args) => {
    assertReadOnlyTailscaleArgs(args);
    return executor("tailscale", args, {
      env: { ...process.env, NO_COLOR: "1" },
      encoding: "utf8",
      timeout: COMMAND_TIMEOUT_MS,
      maxBuffer: COMMAND_MAX_BUFFER_BYTES,
      windowsHide: true,
      shell: false,
    });
  };
}

function checkedAt(options: DashboardDiscoveryOptions): string {
  return (options.now ?? (() => new Date()))().toISOString();
}

function unavailableResult(
  status: Exclude<DashboardDiscoveryResult["status"], "available">,
  options: DashboardDiscoveryOptions,
  candidateCount = 0,
  verifiedCount = 0,
): DashboardDiscoveryResult {
  return {
    status,
    checkedAt: checkedAt(options),
    candidateCount,
    verifiedCount,
    url: null,
    dashboardHealth: null,
    dashboard: null,
  };
}

function sanitizeText(value: string, fallback: string, maxLength: number): string {
  const normalized = value.replace(/[\u0000-\u001f\u007f]/gu, " ").trim();
  const safe = normalized || fallback;
  return safe.length <= maxLength ? safe : `${safe.slice(0, maxLength - 1)}…`;
}

function toNonnegativeInteger(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
}

export function normalizeDashboardSnapshot(
  raw: z.infer<typeof TailscaleOpsStatusSchema>,
): DashboardSnapshot {
  const services = raw.protectedServices.slice(0, 50).map((service) => ({
    name: sanitizeText(service.name, "알 수 없는 서비스", 120),
    mode: sanitizeText(service.mode, "unknown", 80),
    listenerHealthy: service.listenerHealthy,
    backendHealthy: service.backendHealthy,
    status: service.status,
    detail: sanitizeText(service.detail, "상태 설명 없음", 240),
  }));
  const warnings = raw.warnings.slice(0, 20).map((warning) => ({
    severity: warning.severity,
    title: sanitizeText(warning.title, "경고", 160),
    detail: sanitizeText(warning.detail, "추가 설명 없음", 320),
  }));
  const peers = raw.peers
    .slice(0, 50)
    .map((peer) => ({
      name: sanitizeText(peer.name, "알 수 없는 피어", 160),
      os: sanitizeText(peer.os, "unknown", 80),
      online: peer.online,
      lastSeen: peer.lastSeen ? sanitizeText(peer.lastSeen, "", 80) || null : null,
      connection: sanitizeText(peer.connection, "unknown", 120),
      relay: peer.relay ? sanitizeText(peer.relay, "", 120) || null : null,
      latencyMs:
        peer.latencyMs !== null && Number.isFinite(peer.latencyMs) && peer.latencyMs >= 0
          ? peer.latencyMs
          : null,
    }))
    .sort((left, right) => Number(right.online) - Number(left.online) || left.name.localeCompare(right.name));

  return {
    generatedAt: new Date(raw.generatedAt).toISOString(),
    refreshIntervalSeconds: Math.max(1, toNonnegativeInteger(raw.refreshIntervalSeconds)),
    overall: {
      status: raw.overall.status,
      message: sanitizeText(raw.overall.message, "상태 설명 없음", 240),
    },
    device: {
      name: sanitizeText(raw.device.name, "이 Host", 120),
      os: sanitizeText(raw.device.os, "unknown", 80),
      online: raw.device.online,
      version: raw.device.version
        ? sanitizeText(raw.device.version, "", 120) || null
        : null,
    },
    summary: {
      onlinePeers: toNonnegativeInteger(raw.summary.onlinePeers),
      totalPeers: toNonnegativeInteger(raw.summary.totalPeers),
      funnelIngressOnline: toNonnegativeInteger(raw.summary.funnelIngressPeers.online),
      funnelIngressTotal: toNonnegativeInteger(raw.summary.funnelIngressPeers.total),
      serveServices: toNonnegativeInteger(raw.summary.serveServices),
      protectedServices: services.length,
      warningCount: raw.warnings.length,
      funnelEnabled: raw.summary.funnelEnabled,
    },
    services,
    warnings,
    peers,
  };
}

function parseJson(stdout: string): unknown {
  if (!stdout.trim()) {
    throw new Error("Tailscale returned an empty JSON document.");
  }
  return JSON.parse(stdout) as unknown;
}

function isExecutableUnavailable(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: unknown }).code === "ENOENT",
  );
}

function normalizeDnsName(value: string): string {
  return value.trim().replace(/\.+$/u, "").toLocaleLowerCase("en-US");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseServeDocument(stdout: string): Record<string, unknown> {
  const parsed = parseJson(stdout);
  if (!isRecord(parsed)) {
    throw new Error("Tailscale Serve status is not an object.");
  }
  for (const key of ["TCP", "Web", "Services", "Foreground"] as const) {
    if (key in parsed && !isRecord(parsed[key])) {
      throw new Error(`Tailscale Serve ${key} field is not an object.`);
    }
  }
  return parsed;
}

function parseHostPort(value: string): { hostname: string; port: string } | null {
  const separator = value.lastIndexOf(":");
  if (separator <= 0 || separator === value.length - 1) {
    return null;
  }
  const rawHostname = value.slice(0, separator);
  const rawPort = value.slice(separator + 1);
  if (!/^\d{1,5}$/u.test(rawPort)) {
    return null;
  }
  const portNumber = Number(rawPort);
  if (portNumber < 1 || portNumber > 65_535) {
    return null;
  }
  try {
    const parsed = new URL(`https://${value}`);
    if (
      parsed.username ||
      parsed.password ||
      parsed.pathname !== "/" ||
      parsed.search ||
      parsed.hash ||
      !parsed.hostname ||
      normalizeDnsName(parsed.hostname) !== normalizeDnsName(rawHostname)
    ) {
      return null;
    }
    return { hostname: normalizeDnsName(parsed.hostname), port: String(portNumber) };
  } catch {
    return null;
  }
}

function isLoopbackHostname(hostname: string): boolean {
  const normalized = hostname.toLocaleLowerCase("en-US");
  return (
    normalized === "localhost" ||
    normalized === "127.0.0.1" ||
    normalized === "[::1]" ||
    normalized === "::1"
  );
}

function parseLoopbackProxy(value: unknown): URL | null {
  if (typeof value !== "string") {
    return null;
  }
  try {
    const parsed = new URL(value);
    if (
      (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
      !isLoopbackHostname(parsed.hostname) ||
      parsed.username ||
      parsed.password ||
      parsed.search ||
      parsed.hash
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function normalizeMountPath(value: string): string | null {
  if (!value.startsWith("/") || value.includes("?") || value.includes("#")) {
    return null;
  }
  return value.endsWith("/") ? value : `${value}/`;
}

function statusUrlForProxy(proxy: URL): string {
  const base = new URL(proxy.toString());
  base.pathname = base.pathname.endsWith("/") ? base.pathname : `${base.pathname}/`;
  return new URL("api/v1/status", base).toString();
}

export function collectServeCandidates(
  document: Record<string, unknown>,
  selfDnsName: string,
): ServeCandidate[] {
  const tcp = isRecord(document.TCP) ? document.TCP : {};
  const web = isRecord(document.Web) ? document.Web : {};
  const expectedHost = normalizeDnsName(selfDnsName);
  const candidates = new Map<string, ServeCandidate>();

  for (const [hostPort, webConfig] of Object.entries(web)) {
    const parsedHostPort = parseHostPort(hostPort);
    if (!parsedHostPort || parsedHostPort.hostname !== expectedHost) {
      continue;
    }
    const tcpHandler = tcp[parsedHostPort.port];
    if (!isRecord(tcpHandler) || tcpHandler.HTTPS !== true || !isRecord(webConfig)) {
      continue;
    }
    const handlers = webConfig.Handlers;
    if (!isRecord(handlers)) {
      continue;
    }

    for (const [mountPoint, handler] of Object.entries(handlers)) {
      const mountPath = normalizeMountPath(mountPoint);
      const proxy = isRecord(handler) ? parseLoopbackProxy(handler.Proxy) : null;
      if (!mountPath || !proxy) {
        continue;
      }
      const externalPort = parsedHostPort.port === "443" ? "" : `:${parsedHostPort.port}`;
      const publicUrl = `https://${expectedHost}${externalPort}${mountPath}`;
      const candidate = { publicUrl, statusUrl: statusUrlForProxy(proxy) };
      candidates.set(`${candidate.publicUrl}\0${candidate.statusUrl}`, candidate);
    }
  }

  return [...candidates.values()];
}

async function readLimitedJson(response: Response): Promise<unknown> {
  const lengthHeader = response.headers.get("content-length");
  const declaredLength = lengthHeader ? Number(lengthHeader) : Number.NaN;
  if (Number.isFinite(declaredLength) && declaredLength > PROBE_MAX_BYTES) {
    throw new Error("Dashboard response is too large.");
  }

  if (!response.body) {
    throw new Error("Dashboard response has no body.");
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    size += value.byteLength;
    if (size > PROBE_MAX_BYTES) {
      await reader.cancel();
      throw new Error("Dashboard response is too large.");
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
}

async function probeCandidate(
  candidate: ServeCandidate,
  fetchImpl: DashboardFetch,
  timeoutMs: number,
): Promise<ProbeResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(candidate.statusUrl, {
      method: "GET",
      headers: { accept: "application/json" },
      redirect: "error",
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) {
      return { candidate, health: null, dashboard: null, outcome: "failed" };
    }
    const parsed = TailscaleOpsStatusSchema.safeParse(await readLimitedJson(response));
    if (!parsed.success) {
      return { candidate, health: null, dashboard: null, outcome: "failed" };
    }
    const dashboard = normalizeDashboardSnapshot(parsed.data);
    return {
      candidate,
      health: dashboard.overall.status,
      dashboard,
      outcome: "verified",
    };
  } catch (error) {
    const timedOut =
      controller.signal.aborted ||
      (error instanceof Error && error.name === "AbortError");
    return {
      candidate,
      health: null,
      dashboard: null,
      outcome: timedOut ? "timeout" : "failed",
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function discoverTailscaleDashboard(
  options: DashboardDiscoveryOptions = {},
): Promise<DashboardDiscoveryResult> {
  const runTailscale = options.runTailscale ?? createTailscaleRunner();
  let statusResult: TailscaleCommandResult;
  try {
    statusResult = await runTailscale(["status", "--json"]);
  } catch (error) {
    return unavailableResult(
      isExecutableUnavailable(error) ? "tailscale_unavailable" : "command_failed",
      options,
    );
  }

  let status: z.infer<typeof TailscaleStatusSchema>;
  try {
    status = TailscaleStatusSchema.parse(parseJson(statusResult.stdout));
  } catch {
    return unavailableResult("command_failed", options);
  }

  if (status.BackendState !== "Running" || status.Self?.Online !== true) {
    return unavailableResult("tailscale_disconnected", options);
  }
  const selfDnsName = status.Self.DNSName?.trim();
  if (!selfDnsName) {
    return unavailableResult("command_failed", options);
  }

  let serveResult: TailscaleCommandResult;
  try {
    serveResult = await runTailscale(["serve", "status", "--json"]);
  } catch (error) {
    return unavailableResult(
      isExecutableUnavailable(error) ? "tailscale_unavailable" : "command_failed",
      options,
    );
  }

  let candidates: ServeCandidate[];
  try {
    candidates = collectServeCandidates(parseServeDocument(serveResult.stdout), selfDnsName);
  } catch {
    return unavailableResult("command_failed", options);
  }
  if (candidates.length === 0) {
    return unavailableResult("not_found", options);
  }
  if (candidates.length > MAX_CANDIDATES) {
    return unavailableResult("multiple", options, candidates.length);
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const probeResults = await Promise.all(
    candidates.map((candidate) =>
      probeCandidate(candidate, fetchImpl, options.probeTimeoutMs ?? PROBE_TIMEOUT_MS),
    ),
  );
  const verified = probeResults.filter(
    (result): result is ProbeResult & {
      health: DashboardHealth;
      dashboard: DashboardSnapshot;
    } =>
      result.outcome === "verified" &&
      result.health !== null &&
      result.dashboard !== null,
  );

  if (verified.length === 1) {
    return {
      status: "available",
      checkedAt: checkedAt(options),
      candidateCount: candidates.length,
      verifiedCount: 1,
      url: verified[0].candidate.publicUrl,
      dashboardHealth: verified[0].health,
      dashboard: verified[0].dashboard,
    };
  }
  if (verified.length > 1) {
    return unavailableResult("multiple", options, candidates.length, verified.length);
  }
  if (probeResults.some((result) => result.outcome === "timeout")) {
    return unavailableResult("verification_timeout", options, candidates.length);
  }
  return unavailableResult("verification_failed", options, candidates.length);
}
