import { remainingPercentForProvider } from "./provider-usage.logic";
import type { PluginTheme } from "@getpaseo/plugin";
import type { ProviderUsage, UsageTone } from "./provider-usage.shared";

export type UsageViewStatus = "loading" | "empty" | "available" | "unavailable" | "error";

const COPY: Record<Exclude<UsageViewStatus, "available">, { title: string; description: string }> = {
  loading: {
    title: "Usage를 읽는 중",
    description: "선택된 Host의 Codex와 Grok 계획 사용량을 읽기 전용으로 조회합니다.",
  },
  empty: {
    title: "표시할 Provider가 없음",
    description: "이 Host에서 Codex 또는 Grok 사용량을 아직 읽지 못했습니다.",
  },
  unavailable: {
    title: "사용량을 읽을 수 없음",
    description: "해당 Provider CLI에 로그인되어 있는지 확인하세요. 만료된 토큰은 다시 로그인해야 합니다.",
  },
  error: {
    title: "사용량 조회 실패",
    description: "선택한 Host의 네트워크와 Provider 인증 상태를 확인한 뒤 다시 시도하세요.",
  },
};

export function usageCopy(status: Exclude<UsageViewStatus, "available">) {
  return COPY[status];
}

export function snapshotStatus(providers: readonly ProviderUsage[], loading: boolean, failed: boolean): UsageViewStatus {
  if (loading && providers.length === 0) return "loading";
  if (failed && providers.length === 0) return "error";
  if (providers.length === 0) return "empty";
  return "available";
}

export function toneColor(theme: PluginTheme, tone: UsageTone): string {
  if (tone === "danger") return theme.colors.statusDanger;
  if (tone === "warning") return theme.colors.statusWarning;
  if (tone === "ok") return theme.colors.statusSuccess;
  return theme.colors.foregroundMuted;
}

export function formatPercent(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return `${Math.round(value)}%`;
}

export function formatResetAt(resetsAt: string | null | undefined, now = new Date()): string | null {
  if (!resetsAt) return null;
  const date = new Date(resetsAt);
  if (!Number.isFinite(date.getTime())) return null;
  const formatter = new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  const label = formatter.format(date);
  return date.getTime() <= now.getTime() ? `Reset ${label}` : `Resets ${label}`;
}

export function formatBalance(remaining: number | null, limit: number | null, unit: string | null): string {
  if (typeof remaining === "number" && typeof limit === "number") {
    return `${formatCount(remaining)} / ${formatCount(limit)}${unitSuffix(unit)}`;
  }
  if (typeof remaining === "number") return `${formatCount(remaining)}${unitSuffix(unit)}`;
  if (typeof limit === "number") return `limit ${formatCount(limit)}${unitSuffix(unit)}`;
  return "—";
}

export function pillLabel(provider: ProviderUsage | null, providerId: string | null): string {
  const name = provider?.label ?? displayNameForProviderId(providerId);
  if (!provider) return `${name} —`;
  if (provider.status !== "available") return `${name} —`;
  return `${name} ${formatPercent(remainingPercentForProvider(provider))}`;
}

export function pillAccessibilityLabel(provider: ProviderUsage | null, providerId: string | null): string {
  const name = provider?.label ?? displayNameForProviderId(providerId);
  if (!provider) return `${name} usage unavailable`;
  if (provider.status === "error") return `${name} usage failed`;
  if (provider.status === "unavailable") return `${name} usage unavailable`;
  const remaining = remainingPercentForProvider(provider);
  if (remaining === null) return `${name} usage available`;
  return `${name} ${Math.round(remaining)} percent remaining`;
}

export function displayNameForProviderId(providerId: string | null): string {
  if (providerId === "codex") return "Codex";
  if (providerId === "grok") return "Grok";
  return providerId ? providerId : "Provider";
}

function formatCount(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(2).replace(/\.?0+$/u, "");
}

function unitSuffix(unit: string | null): string {
  if (!unit) return "";
  if (unit === "usd") return " USD";
  return ` ${unit}`;
}
