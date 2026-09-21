import type {
  PluginClientContext,
  PluginComposerPillContribution,
  PluginButtonIconProps,
} from "@getpaseo/plugin/client";
import type { ComponentType } from "react";
import { describe, expect, it, vi } from "vitest";
import { registerUsagePills } from "./usage-registration";

type AgentUpdate = Parameters<
  Parameters<PluginClientContext["paseo"]["agents"]["subscribe"]>[0]
>[0];
type AgentListResult = Awaited<ReturnType<PluginClientContext["paseo"]["agents"]["list"]>>;

const TestPill = (() => null) as ComponentType<PluginButtonIconProps>;

function setup() {
  let emit: (update: AgentUpdate) => void = () => {};
  const unsubscribe = vi.fn();
  const refreshUsage = vi.fn(async () => {});
  const list = vi.fn<() => Promise<AgentListResult>>(async () => ({
    requestId: "list-agents",
    entries: [],
    pageInfo: { nextCursor: null, prevCursor: null, hasMore: false },
  }));
  const registrations: PluginComposerPillContribution[] = [];
  const removers: ReturnType<typeof vi.fn>[] = [];
  const addComposerPill = vi.fn((contribution: PluginComposerPillContribution) => {
    registrations.push(contribution);
    const remove = vi.fn();
    removers.push(remove);
    return { remove, update: vi.fn() };
  });
  const subscribe = vi.fn((handler: (update: AgentUpdate) => void) => {
    emit = handler;
    return unsubscribe;
  });
  let emitProviders: () => void = () => {};
  const unsubscribeProviders = vi.fn();
  const snapshot = vi.fn(async () => ({ entries: [
    { provider: "codex", enabled: true }, { provider: "grok", enabled: true },
    { provider: "claude", enabled: false }, { provider: "custom", enabled: true },
  ] }));
  const client = {
    addComposerPill,
    paseo: { agents: { list, subscribe }, providers: { snapshot, subscribe: (handler: () => void) => { emitProviders = handler; return unsubscribeProviders; } } },
  } as unknown as PluginClientContext;

  return {
    client, snapshot, unsubscribeProviders,
    emitProviders: () => emitProviders(),
    emit(update: AgentUpdate) {
      emit(update);
    },
    unsubscribe,
    refreshUsage,
    list,
    registrations,
    removers,
    addComposerPill,
  };
}

function upsert(
  agentId: string,
  workspaceId?: string,
  provider?: string,
  archivedAt: string | null = null,
) {
  return {
    kind: "upsert",
    agent: { id: agentId, workspaceId, provider, archivedAt },
  } as AgentUpdate;
}

describe("usage composer pill registration", () => {
  it("registers pills for agents with enabled connections that were active before the plugin loaded", async () => {
    const context = setup();
    context.list.mockResolvedValueOnce({
      entries: [{ agent: { id: "agent-1", workspaceId: "workspace-1", provider: "codex/gpt-5.4" } }],
    } as AgentListResult);

    registerUsagePills(context.client, () => TestPill, context.refreshUsage);
    await Promise.resolve();

    expect(context.list).toHaveBeenCalledWith({ scope: "active", page: { limit: 200 }, subscribe: {} });
    expect(context.addComposerPill).toHaveBeenCalledTimes(1);
    expect(context.registrations[0]).toMatchObject({
      id: "usage",
      button: { title: "Refresh provider usage" },
      workspaceId: "workspace-1",
      agentId: "agent-1",
    });
  });

  it("refreshes usage from the pill and ignores disabled providers", async () => {
    const context = setup();
    registerUsagePills(context.client, () => TestPill, context.refreshUsage);
    await Promise.resolve();
    context.emit(upsert("agent-1", "workspace-1", "grok/grok-code"));
    context.emit(upsert("agent-2", "workspace-1", "claude/sonnet"));

    expect(context.addComposerPill).toHaveBeenCalledTimes(1);
    await press(context.registrations[0]);
    expect(context.refreshUsage).toHaveBeenCalledTimes(1);
  });

  it("shares an in-flight refresh so duplicate presses fetch once", async () => {
    const context = setup();
    let finish: () => void = () => {};
    context.refreshUsage.mockImplementationOnce(
      () => new Promise<void>((resolve) => (finish = resolve)),
    );
    registerUsagePills(context.client, () => TestPill, context.refreshUsage);
    await Promise.resolve();
    context.emit(upsert("agent-1", "workspace-1", "codex/gpt-5.4"));

    const firstPress = press(context.registrations[0]);
    const secondPress = press(context.registrations[0]);
    expect(context.refreshUsage).toHaveBeenCalledTimes(1);
    finish();
    await Promise.all([firstPress, secondPress]);
  });

  it("does not restore a stale list entry after a newer removal update", async () => {
    const context = setup();
    let resolveList: (result: AgentListResult) => void = () => {};
    context.list.mockImplementationOnce(
      () => new Promise<AgentListResult>((resolve) => (resolveList = resolve)),
    );

    registerUsagePills(context.client, () => TestPill, context.refreshUsage);
    context.emit({ kind: "remove", agentId: "agent-1" } as AgentUpdate);
    resolveList({
      entries: [{ agent: { id: "agent-1", workspaceId: "workspace-1", provider: "codex/gpt-5.4" } }],
    } as AgentListResult);
    await Promise.resolve();

    expect(context.addComposerPill).not.toHaveBeenCalled();
  });

  it("removes pills for archived agents and cleans up on dispose", async () => {
    const context = setup();
    const dispose = registerUsagePills(context.client, () => TestPill, context.refreshUsage);
    await Promise.resolve();
    context.emit(upsert("agent-1", "workspace-1", "codex/gpt-5.4"));
    context.emit(upsert("agent-1", "workspace-1", "codex/gpt-5.4", "2026-09-04T00:00:00.000Z"));
    expect(context.removers[0]).toHaveBeenCalledTimes(1);
    context.emit(upsert("agent-2", "workspace-1", "grok"));
    dispose();
    expect(context.unsubscribe).toHaveBeenCalledTimes(1);
    expect(context.unsubscribeProviders).toHaveBeenCalledTimes(1);
    expect(context.removers[1]).toHaveBeenCalledTimes(1);
  });
  it("adds and removes arbitrary provider pills as connections change", async () => {
    const context = setup();
    const dispose = registerUsagePills(context.client, () => TestPill, context.refreshUsage);
    context.emit(upsert("custom-agent", "workspace", "custom/model"));
    await Promise.resolve();
    expect(context.registrations[0]?.agentId).toBe("custom-agent");
    context.snapshot.mockResolvedValue({ entries: [{ provider: "custom", enabled: false }] });
    context.emitProviders();
    await Promise.resolve();
    expect(context.removers[0]).toHaveBeenCalledTimes(1);
    context.snapshot.mockResolvedValue({ entries: [{ provider: "custom", enabled: true }] });
    context.emitProviders();
    await Promise.resolve();
    expect(context.registrations).toHaveLength(2);
    dispose();
    dispose();
    context.emitProviders();
    await Promise.resolve();
    expect(context.registrations).toHaveLength(2);
  });

  it("ignores stale provider snapshots and stops reads after disposal", async () => {
    const context = setup();
    type Catalog = Awaited<ReturnType<typeof context.snapshot>>;
    let resolve: (value: Catalog) => void = () => {};
    context.snapshot.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    const dispose = registerUsagePills(context.client, () => TestPill, context.refreshUsage);
    context.emit(upsert("agent", "workspace", "custom/model"));
    context.snapshot.mockResolvedValue({ entries: [{ provider: "custom", enabled: false }] });
    context.emitProviders();
    await Promise.resolve();
    resolve({ entries: [{ provider: "custom", enabled: true }] });
    await Promise.resolve();
    expect(context.registrations).toHaveLength(0);
    context.snapshot.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    context.emitProviders();
    dispose();
    resolve({ entries: [{ provider: "custom", enabled: true }] });
    await Promise.resolve();
    const calls = context.snapshot.mock.calls.length;
    context.emitProviders();
    expect(context.snapshot).toHaveBeenCalledTimes(calls);
    expect(context.registrations).toHaveLength(0);
  });

});

function press(pill: PluginComposerPillContribution) {
  if (pill.button.behavior.kind !== "action") throw new Error("Expected action");
  return pill.button.behavior.onPress();
}
