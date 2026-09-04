import { describe, expect, it } from "vitest";
import {
  findProviderUsage,
  isSupportedProviderId,
  parseAgentProviderId,
  pickPrimaryWindow,
  remainingPercentForProvider,
  toneFromUsedPercent,
  usedPercentOf,
  windowFromUsedPercent,
} from "./provider-usage.logic";
import type { ProviderUsage, UsageWindow } from "./provider-usage.shared";

function window(overrides: Partial<UsageWindow> = {}): UsageWindow {
  return {
    id: "weekly",
    label: "Weekly",
    usedPercent: 40,
    remainingPercent: 60,
    resetsAt: null,
    tone: "ok",
    ...overrides,
  };
}

function provider(overrides: Partial<ProviderUsage> = {}): ProviderUsage {
  return {
    id: "codex",
    label: "Codex",
    status: "available",
    planLabel: "plus",
    windows: [window()],
    balances: [],
    error: null,
    ...overrides,
  };
}

describe("provider usage logic", () => {
  it("parses agent provider ids and recognizes the supported set", () => {
    expect(parseAgentProviderId("codex/gpt-5.4")).toBe("codex");
    expect(parseAgentProviderId("grok")).toBe("grok");
    expect(parseAgentProviderId("  ")).toBeNull();
    expect(isSupportedProviderId("codex")).toBe(true);
    expect(isSupportedProviderId("claude")).toBe(false);
  });

  it("maps used percent to the Settings usage tones", () => {
    expect(toneFromUsedPercent(0)).toBe("ok");
    expect(toneFromUsedPercent(70)).toBe("warning");
    expect(toneFromUsedPercent(91)).toBe("danger");
    expect(toneFromUsedPercent(null)).toBe("default");
    expect(usedPercentOf(25, 100)).toBe(25);
    expect(usedPercentOf(25, 0)).toBeNull();
  });

  it("picks the most consumed window as the glance value", () => {
    const session = window({ id: "session", usedPercent: 20, remainingPercent: 80 });
    const weekly = window({ id: "weekly", usedPercent: 88, remainingPercent: 12, tone: "warning" });
    expect(pickPrimaryWindow([session, weekly])?.id).toBe("weekly");
    expect(remainingPercentForProvider(provider({ windows: [session, weekly] }))).toBe(12);
  });

  it("fills remaining percent from used percent", () => {
    expect(windowFromUsedPercent({ id: "session", label: "Session", usedPercent: 30 }).remainingPercent).toBe(70);
  });

  it("does not invent a remaining percent for unavailable providers", () => {
    expect(
      remainingPercentForProvider(
        provider({ status: "unavailable", windows: [window({ usedPercent: 10, remainingPercent: 90 })] }),
      ),
    ).toBeNull();
    expect(findProviderUsage([provider()], "grok")).toBeNull();
    expect(findProviderUsage([provider()], "codex")?.label).toBe("Codex");
  });
});
