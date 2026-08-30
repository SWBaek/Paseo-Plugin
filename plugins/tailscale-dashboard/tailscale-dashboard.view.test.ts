import { describe, expect, it } from "vitest";
import type { DashboardDiscoveryResult } from "./tailscale-dashboard.shared";
import {
  canOpenDashboard,
  discoveryCopy,
  discoveryTone,
  visiblePeers,
  type DashboardViewStatus,
} from "./tailscale-dashboard.view";

const statuses: DashboardViewStatus[] = [
  "loading",
  "available",
  "not_found",
  "multiple",
  "tailscale_unavailable",
  "tailscale_disconnected",
  "command_failed",
  "verification_failed",
  "verification_timeout",
];

function result(overrides: Partial<DashboardDiscoveryResult>): DashboardDiscoveryResult {
  return {
    status: "not_found",
    checkedAt: "2026-08-28T12:00:00.000Z",
    candidateCount: 0,
    verifiedCount: 0,
    url: null,
    dashboardHealth: null,
    dashboard: null,
    ...overrides,
  };
}

describe("Dashboard view state", () => {
  it("provides actionable copy for every discovery state", () => {
    for (const status of statuses) {
      const copy = discoveryCopy(status);
      expect(copy.title.length).toBeGreaterThan(0);
      expect(copy.description.length).toBeGreaterThan(0);
    }
  });

  it("enables browser opening only for a verified available result", () => {
    expect(
      canOpenDashboard(
        result({
          status: "available",
          url: "https://node.example.ts.net:7443/",
          dashboardHealth: "healthy",
          dashboard: {
            generatedAt: "2026-08-28T12:00:00.000Z",
            refreshIntervalSeconds: 15,
            overall: { status: "healthy", message: "정상" },
            device: { name: "example", os: "windows", online: true, version: null },
            summary: {
              onlinePeers: 1,
              totalPeers: 1,
              funnelIngressOnline: 0,
              funnelIngressTotal: 0,
              serveServices: 1,
              protectedServices: 1,
              warningCount: 0,
              funnelEnabled: false,
            },
            services: [],
            warnings: [],
            peers: [],
          },
          candidateCount: 1,
          verifiedCount: 1,
        }),
      ),
    ).toBe(true);
    expect(canOpenDashboard(result({ status: "multiple" }))).toBe(false);
  });

  it("maps health and failure states to semantic tones", () => {
    expect(discoveryTone("available", "healthy")).toBe("success");
    expect(discoveryTone("available", "warning")).toBe("warning");
    expect(discoveryTone("available", "error")).toBe("danger");
    expect(discoveryTone("tailscale_disconnected", null)).toBe("warning");
    expect(discoveryTone("command_failed", null)).toBe("danger");
  });

  it("limits peer rows by layout until the user expands the section", () => {
    const peers = Array.from({ length: 15 }, (_, index) => ({
      name: `peer-${index}`,
      os: "linux",
      online: index < 3,
      lastSeen: null,
      connection: "relay",
      relay: null,
      latencyMs: null,
    }));

    expect(visiblePeers(peers, false, true)).toHaveLength(8);
    expect(visiblePeers(peers, false, false)).toHaveLength(12);
    expect(visiblePeers(peers, true, true)).toHaveLength(15);
  });
});
