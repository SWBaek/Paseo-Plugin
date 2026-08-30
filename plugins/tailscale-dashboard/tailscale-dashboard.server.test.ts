import { describe, expect, it, vi } from "vitest";
import { DashboardDiscoveryResultSchema } from "./tailscale-dashboard.shared";
import {
  assertReadOnlyTailscaleArgs,
  collectServeCandidates,
  createTailscaleRunner,
  discoverTailscaleDashboard,
  type DashboardFetch,
  type TailscaleRunner,
} from "./tailscale-dashboard.server";

const NOW = new Date("2026-08-28T12:00:00.000Z");
const DNS_NAME = "node.example.ts.net";

function statusDocument(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    BackendState: "Running",
    Self: { Online: true, DNSName: `${DNS_NAME}.` },
    ...overrides,
  });
}

function serveDocument(entries: Array<{ port: number; proxy: string; mount?: string }> = [
  { port: 7443, proxy: "http://127.0.0.1:43123" },
]): string {
  return JSON.stringify({
    TCP: Object.fromEntries(entries.map(({ port }) => [String(port), { HTTPS: true }])),
    Web: Object.fromEntries(
      entries.map(({ port, proxy, mount = "/" }) => [
        `${DNS_NAME}:${port}`,
        { Handlers: { [mount]: { Proxy: proxy } } },
      ]),
    ),
  });
}

function dashboardDocument(status: "healthy" | "warning" | "error" = "healthy") {
  return {
    generatedAt: NOW.toISOString(),
    refreshIntervalSeconds: 15,
    overall: { status, message: "ok" },
    device: {
      name: "example-node",
      os: "windows",
      online: true,
      version: "1.0.0",
      tailscaleIp: "203.0.113.10",
    },
    summary: {
      onlinePeers: 3,
      totalPeers: 5,
      funnelIngressPeers: { online: 1, total: 2 },
      serveServices: 2,
      funnelEnabled: false,
      projectsDownloadPort: 43123,
    },
    protectedServices: [
      {
        name: "Dashboard",
        port: 43123,
        mode: "tailnet",
        processes: ["node"],
        bindAddresses: ["127.0.0.1"],
        listenerHealthy: true,
        backendHealthy: true,
        status,
        detail: "리스너와 백엔드가 정상입니다",
      },
    ],
    peers: [
      {
        name: "peer-one",
        os: "linux",
        online: true,
        lastSeen: null,
        connection: "direct",
        relay: null,
        latencyMs: 12.5,
        ipHint: "203.0.113.11",
      },
      {
        name: "peer-two",
        os: "android",
        online: false,
        lastSeen: "2026-08-28T10:00:00.000Z",
        connection: "offline",
        relay: "example-relay",
        latencyMs: null,
        ipHint: "203.0.113.12",
      },
    ],
    warnings: [
      {
        severity: "warning",
        title: "검토할 항목",
        detail: "예시 경고입니다",
      },
    ],
    serve: [{ target: "http://127.0.0.1:43123" }],
  };
}

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function runnerFor(status: string, serve: string): TailscaleRunner {
  return vi.fn(async (args: readonly string[]) => {
    if (args[0] === "status") {
      return { stdout: status, stderr: "" };
    }
    return { stdout: serve, stderr: "" };
  });
}

describe("Tailscale command safety", () => {
  it("allows only the two documented read-only JSON commands", () => {
    expect(() => assertReadOnlyTailscaleArgs(["status", "--json"])).not.toThrow();
    expect(() =>
      assertReadOnlyTailscaleArgs(["serve", "status", "--json"]),
    ).not.toThrow();
    expect(() => assertReadOnlyTailscaleArgs(["serve", "reset"])).toThrow(
      "Blocked non-read-only Tailscale command.",
    );
    expect(() => assertReadOnlyTailscaleArgs(["up"])).toThrow();
  });

  it("executes without a shell and with bounded resources", async () => {
    const executor = vi.fn(async () => ({ stdout: "{}", stderr: "" }));
    const run = createTailscaleRunner(executor);

    await run(["status", "--json"]);

    expect(executor).toHaveBeenCalledOnce();
    expect(executor).toHaveBeenCalledWith(
      "tailscale",
      ["status", "--json"],
      expect.objectContaining({
        shell: false,
        windowsHide: true,
        encoding: "utf8",
        timeout: 10_000,
        maxBuffer: 2 * 1024 * 1024,
      }),
    );
  });
});

describe("Serve candidate parsing", () => {
  it("keeps matching HTTPS mappings backed by loopback HTTP only", () => {
    const candidates = collectServeCandidates(
      {
        TCP: {
          "443": { HTTPS: true },
          "7443": { HTTPS: true },
          "8443": { HTTP: true },
        },
        Web: {
          [`${DNS_NAME}:443`]: {
            Handlers: { "/": { Proxy: "http://127.0.0.1:43123" } },
          },
          [`${DNS_NAME}:7443`]: {
            Handlers: { "/ops": { Proxy: "http://[::1]:43124/base" } },
          },
          [`${DNS_NAME}:8443`]: {
            Handlers: { "/": { Proxy: "http://127.0.0.1:43125" } },
          },
          "other.example.ts.net:443": {
            Handlers: { "/": { Proxy: "http://127.0.0.1:43126" } },
          },
          [`${DNS_NAME}:9443`]: {
            Handlers: { "/": { Proxy: "https://internal.example.test" } },
          },
        },
      },
      `${DNS_NAME}.`,
    );

    expect(candidates).toEqual([
      {
        publicUrl: `https://${DNS_NAME}/`,
        statusUrl: "http://127.0.0.1:43123/api/v1/status",
      },
      {
        publicUrl: `https://${DNS_NAME}:7443/ops/`,
        statusUrl: "http://[::1]:43124/base/api/v1/status",
      },
    ]);
  });
});

describe("Dashboard discovery", () => {
  it("returns one verified dashboard and validates the RPC output", async () => {
    const fetchImpl = vi.fn<DashboardFetch>(async () => jsonResponse(dashboardDocument("warning")));

    const result = await discoverTailscaleDashboard({
      runTailscale: runnerFor(statusDocument(), serveDocument()),
      fetchImpl,
      now: () => NOW,
    });

    expect(result).toEqual({
      status: "available",
      checkedAt: NOW.toISOString(),
      candidateCount: 1,
      verifiedCount: 1,
      url: `https://${DNS_NAME}:7443/`,
      dashboardHealth: "warning",
      dashboard: expect.objectContaining({
        generatedAt: NOW.toISOString(),
        overall: { status: "warning", message: "ok" },
        summary: expect.objectContaining({
          onlinePeers: 3,
          totalPeers: 5,
          protectedServices: 1,
          warningCount: 1,
        }),
        services: [
          expect.objectContaining({
            name: "Dashboard",
            listenerHealthy: true,
            backendHealthy: true,
          }),
        ],
        peers: [
          expect.objectContaining({ name: "peer-one", online: true }),
          expect.objectContaining({ name: "peer-two", online: false }),
        ],
      }),
    });
    expect(() => DashboardDiscoveryResultSchema.parse(result)).not.toThrow();
    const clientSnapshot = JSON.stringify(result.dashboard);
    expect(clientSnapshot).not.toContain("203.0.113");
    expect(clientSnapshot).not.toContain("127.0.0.1");
    expect(clientSnapshot).not.toContain("43123");
    expect(clientSnapshot).not.toContain("processes");
    expect(clientSnapshot).not.toContain("target");
    expect(fetchImpl).toHaveBeenCalledWith(
      "http://127.0.0.1:43123/api/v1/status",
      expect.objectContaining({ method: "GET", redirect: "error", cache: "no-store" }),
    );
  });

  it("stops before Serve inspection when Tailscale is disconnected", async () => {
    const runTailscale = runnerFor(
      statusDocument({ BackendState: "Stopped", Self: { Online: false } }),
      serveDocument(),
    );

    const result = await discoverTailscaleDashboard({ runTailscale, now: () => NOW });

    expect(result.status).toBe("tailscale_disconnected");
    expect(runTailscale).toHaveBeenCalledTimes(1);
  });

  it("distinguishes an unavailable executable from another command failure", async () => {
    const unavailable = Object.assign(new Error("missing"), { code: "ENOENT" });
    const missingResult = await discoverTailscaleDashboard({
      runTailscale: vi.fn(async () => Promise.reject(unavailable)),
      now: () => NOW,
    });
    const failedResult = await discoverTailscaleDashboard({
      runTailscale: vi.fn(async () => Promise.reject(new Error("failed"))),
      now: () => NOW,
    });

    expect(missingResult.status).toBe("tailscale_unavailable");
    expect(failedResult.status).toBe("command_failed");
  });

  it("does not choose when more than one candidate verifies", async () => {
    const result = await discoverTailscaleDashboard({
      runTailscale: runnerFor(
        statusDocument(),
        serveDocument([
          { port: 7443, proxy: "http://127.0.0.1:43123" },
          { port: 8443, proxy: "http://127.0.0.1:43124" },
        ]),
      ),
      fetchImpl: async () => jsonResponse(dashboardDocument()),
      now: () => NOW,
    });

    expect(result).toMatchObject({
      status: "multiple",
      candidateCount: 2,
      verifiedCount: 2,
      url: null,
      dashboard: null,
    });
  });

  it("distinguishes probe timeout from an invalid Dashboard response", async () => {
    const timeoutFetch: DashboardFetch = (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
        });
      });
    const timeoutResult = await discoverTailscaleDashboard({
      runTailscale: runnerFor(statusDocument(), serveDocument()),
      fetchImpl: timeoutFetch,
      probeTimeoutMs: 1,
      now: () => NOW,
    });
    const invalidResult = await discoverTailscaleDashboard({
      runTailscale: runnerFor(statusDocument(), serveDocument()),
      fetchImpl: async () => jsonResponse({ service: "something-else" }),
      now: () => NOW,
    });

    expect(timeoutResult.status).toBe("verification_timeout");
    expect(invalidResult.status).toBe("verification_failed");
  });

  it("treats empty config as not found and malformed known fields as command failure", async () => {
    const notFound = await discoverTailscaleDashboard({
      runTailscale: runnerFor(statusDocument(), "{}"),
      now: () => NOW,
    });
    const malformed = await discoverTailscaleDashboard({
      runTailscale: runnerFor(statusDocument(), JSON.stringify({ Web: [] })),
      now: () => NOW,
    });

    expect(notFound.status).toBe("not_found");
    expect(malformed.status).toBe("command_failed");
  });

  it("rejects oversized status responses", async () => {
    const result = await discoverTailscaleDashboard({
      runTailscale: runnerFor(statusDocument(), serveDocument()),
      fetchImpl: async () =>
        new Response("{}", {
          headers: { "content-length": String(512 * 1024 + 1) },
        }),
      now: () => NOW,
    });

    expect(result.status).toBe("verification_failed");
  });
});
