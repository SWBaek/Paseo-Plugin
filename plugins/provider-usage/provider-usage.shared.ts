import { defineRpc } from "@getpaseo/plugin/server";
import { z } from "zod";

export const SUPPORTED_PROVIDER_IDS = ["codex", "grok"] as const;

export const UsageToneSchema = z.enum(["ok", "warning", "danger", "default"]);

export const UsageWindowSchema = z.object({
  id: z.string(),
  label: z.string(),
  usedPercent: z.number().nullable(),
  remainingPercent: z.number().nullable(),
  resetsAt: z.string().nullable(),
  tone: UsageToneSchema,
});

export const UsageBalanceSchema = z.object({
  id: z.string(),
  label: z.string(),
  used: z.number().nullable(),
  remaining: z.number().nullable(),
  limit: z.number().nullable(),
  unit: z.string().nullable(),
  tone: UsageToneSchema,
});

export const ProviderUsageSchema = z.object({
  id: z.string(),
  label: z.string(),
  status: z.enum(["available", "unavailable", "error"]),
  planLabel: z.string().nullable(),
  windows: z.array(UsageWindowSchema),
  balances: z.array(UsageBalanceSchema),
  error: z.string().nullable(),
});

export const ProviderUsageSnapshotSchema = z.object({
  fetchedAt: z.string(),
  providers: z.array(ProviderUsageSchema),
});

export const providerUsageSnapshot = defineRpc({
  name: "provider-usage.snapshot",
  input: z.object({
    providerId: z.string().optional(),
  }),
  output: ProviderUsageSnapshotSchema,
});

export type UsageTone = z.infer<typeof UsageToneSchema>;
export type UsageWindow = z.infer<typeof UsageWindowSchema>;
export type UsageBalance = z.infer<typeof UsageBalanceSchema>;
export type ProviderUsage = z.infer<typeof ProviderUsageSchema>;
export type ProviderUsageSnapshot = z.infer<typeof ProviderUsageSnapshotSchema>;
export type SupportedProviderId = (typeof SUPPORTED_PROVIDER_IDS)[number];
