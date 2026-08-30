import { defineRpc } from "@getpaseo/plugin/server";
import { z } from "zod";

export const DashboardDiscoveryStatusSchema = z.enum([
  "available",
  "not_found",
  "multiple",
  "tailscale_unavailable",
  "tailscale_disconnected",
  "command_failed",
  "verification_failed",
  "verification_timeout",
]);

export const DashboardHealthSchema = z.enum(["healthy", "warning", "error"]);

export const DashboardSnapshotSchema = z.object({
  generatedAt: z.iso.datetime(),
  refreshIntervalSeconds: z.number().int().positive(),
  overall: z.object({
    status: DashboardHealthSchema,
    message: z.string().min(1).max(240),
  }),
  device: z.object({
    name: z.string().min(1).max(120),
    os: z.string().min(1).max(80),
    online: z.boolean(),
    version: z.string().max(120).nullable(),
  }),
  summary: z.object({
    onlinePeers: z.number().int().nonnegative(),
    totalPeers: z.number().int().nonnegative(),
    funnelIngressOnline: z.number().int().nonnegative(),
    funnelIngressTotal: z.number().int().nonnegative(),
    serveServices: z.number().int().nonnegative(),
    protectedServices: z.number().int().nonnegative(),
    warningCount: z.number().int().nonnegative(),
    funnelEnabled: z.boolean(),
  }),
  services: z
    .array(
      z.object({
        name: z.string().min(1).max(120),
        mode: z.string().min(1).max(80),
        listenerHealthy: z.boolean(),
        backendHealthy: z.boolean().nullable(),
        status: DashboardHealthSchema,
        detail: z.string().min(1).max(240),
      }),
    )
    .max(50),
  warnings: z
    .array(
      z.object({
        severity: z.enum(["warning", "error"]),
        title: z.string().min(1).max(160),
        detail: z.string().min(1).max(320),
      }),
    )
    .max(20),
  peers: z
    .array(
      z.object({
        name: z.string().min(1).max(160),
        os: z.string().min(1).max(80),
        online: z.boolean(),
        lastSeen: z.string().max(80).nullable(),
        connection: z.string().min(1).max(120),
        relay: z.string().max(120).nullable(),
        latencyMs: z.number().nonnegative().nullable(),
      }),
    )
    .max(50),
});

export const DashboardDiscoveryResultSchema = z
  .object({
    status: DashboardDiscoveryStatusSchema,
    checkedAt: z.iso.datetime(),
    candidateCount: z.number().int().nonnegative(),
    verifiedCount: z.number().int().nonnegative(),
    url: z.url().nullable(),
    dashboardHealth: DashboardHealthSchema.nullable(),
    dashboard: DashboardSnapshotSchema.nullable(),
  })
  .superRefine((value, context) => {
    if (
      value.status === "available" &&
      (!value.url || !value.dashboardHealth || !value.dashboard)
    ) {
      context.addIssue({
        code: "custom",
        message: "An available dashboard requires a URL, health state, and snapshot.",
      });
    }
    if (
      value.status !== "available" &&
      (value.url || value.dashboardHealth || value.dashboard)
    ) {
      context.addIssue({
        code: "custom",
        message: "Unavailable dashboard results must not expose dashboard data.",
      });
    }
  });

export const tailscaleDashboardDiscover = defineRpc({
  name: "tailscale-dashboard.discover",
  input: z.object({}),
  output: DashboardDiscoveryResultSchema,
});

export type DashboardDiscoveryStatus = z.infer<typeof DashboardDiscoveryStatusSchema>;
export type DashboardHealth = z.infer<typeof DashboardHealthSchema>;
export type DashboardSnapshot = z.infer<typeof DashboardSnapshotSchema>;
export type DashboardDiscoveryResult = z.infer<typeof DashboardDiscoveryResultSchema>;
