import {
  SUPPORTED_PROVIDER_IDS,
  type ProviderUsage,
  type SupportedProviderId,
  type UsageBalance,
  type UsageTone,
  type UsageWindow,
} from "./provider-usage.shared";

const SUPPORTED_PROVIDER_ID_SET = new Set<string>(SUPPORTED_PROVIDER_IDS);

export function parseAgentProviderId(provider: string | null | undefined): string | null {
  if (!provider) return null;
  const [id] = provider.split("/");
  const trimmed = id?.trim().toLowerCase() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

export function isSupportedProviderId(providerId: string | null | undefined): providerId is SupportedProviderId {
  return typeof providerId === "string" && SUPPORTED_PROVIDER_ID_SET.has(providerId);
}

export function usedPercentOf(used: number | null | undefined, limit: number | null | undefined): number | null {
  if (typeof used !== "number" || typeof limit !== "number" || limit <= 0) return null;
  return (used / limit) * 100;
}

export function toneFromUsedPercent(usedPercent: number | null | undefined): UsageTone {
  if (typeof usedPercent !== "number") return "default";
  if (usedPercent > 90) return "danger";
  if (usedPercent >= 70) return "warning";
  return "ok";
}

export function toneFromRemaining(remaining: number | null | undefined): UsageTone {
  if (typeof remaining !== "number") return "default";
  if (remaining <= 0) return "danger";
  return "ok";
}

export function windowFromUsedPercent(input: {
  id: string;
  label: string;
  usedPercent: number | null | undefined;
  resetsAt?: string | null;
}): UsageWindow {
  const usedPercent = typeof input.usedPercent === "number" ? input.usedPercent : null;
  return {
    id: input.id,
    label: input.label,
    usedPercent,
    remainingPercent: usedPercent === null ? null : Math.max(0, 100 - usedPercent),
    resetsAt: input.resetsAt ?? null,
    tone: toneFromUsedPercent(usedPercent),
  };
}

export function pickPrimaryWindow(windows: readonly UsageWindow[]): UsageWindow | null {
  const ranked = windows.filter((window) => typeof window.usedPercent === "number");
  if (ranked.length === 0) return windows[0] ?? null;
  return ranked.reduce((highest, window) =>
    (window.usedPercent ?? 0) > (highest.usedPercent ?? 0) ? window : highest,
  );
}

export function pickPrimaryBalance(balances: readonly UsageBalance[]): UsageBalance | null {
  const ranked = balances.filter((balance) => typeof usedPercentOf(balance.used, balance.limit) === "number");
  if (ranked.length === 0) return balances[0] ?? null;
  return ranked.reduce((highest, balance) => {
    const current = usedPercentOf(balance.used, balance.limit) ?? 0;
    const previous = usedPercentOf(highest.used, highest.limit) ?? 0;
    return current > previous ? balance : highest;
  });
}

export function findProviderUsage(
  providers: readonly ProviderUsage[],
  providerId: string | null | undefined,
): ProviderUsage | null {
  if (!providerId) return null;
  return providers.find((provider) => provider.id === providerId) ?? null;
}

export function remainingPercentForProvider(provider: ProviderUsage | null): number | null {
  if (!provider || provider.status !== "available") return null;
  const window = pickPrimaryWindow(provider.windows);
  if (typeof window?.remainingPercent === "number") return window.remainingPercent;
  const balance = pickPrimaryBalance(provider.balances);
  const usedPercent = usedPercentOf(balance?.used ?? null, balance?.limit ?? null);
  return usedPercent === null ? null : Math.max(0, 100 - usedPercent);
}
