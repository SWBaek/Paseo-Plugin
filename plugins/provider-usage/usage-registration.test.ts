import type {
  PluginClientContext,
  PluginComposerPillContribution,
  PluginComposerPillProps,
} from "@getpaseo/plugin";
import type { ComponentType } from "react";
import { describe, expect, it, vi } from "vitest";
import { registerUsagePills } from "./usage-registration";

type AgentUpdate = Parameters<
  Parameters<PluginClientContext["paseo"]["agents"]["subscribe"]>[0]
>[0];
type AgentListResult = Awaited<ReturnType<PluginClientContext["paseo"]["agents"]["list"]>>;

const TestPill = (() => null) as ComponentType<PluginComposerPillProps>;

function setup() {
  let emit: (update: AgentUpdate) => void = () => {};
  const unsubscribe = vi.fn();
  const openSurface = vi.fn();
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
    return remove;
  });
  const subscribe = vi.fn((handler: (update: AgentUpdate) => void) => {
    emit = handler;
    return unsubscribe;
  });
  const client = {
    addComposerPill,
    openSurface,
    paseo: { agents: { list, subscribe } },
  } as unknown as PluginClientContext;

  return {
    client,
    emit(update: AgentUpdate) {
      emit(update);
    },
    unsubscribe,
    openSurface,
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
  it("registers pills for supported agents that were active before the plugin loaded", async () => {
    const context = setup();
    context.list.mockResolvedValueOnce({
      entries: [{ agent: { id: "agent-1", workspaceId: "workspace-1", provider: "codex/gpt-5.4" } }],
    } as AgentListResult);

    registerUsagePills(context.client, TestPill);
    await Promise.resolve();

    expect(context.addComposerPill).toHaveBeenCalledTimes(1);
    expect(context.registrations[0]).toMatchObject({
      id: "usage",
      title: "Open provider usage",
      workspaceId: "workspace-1",
      agentId: "agent-1",
    });
  });

  it("opens the usage surface from the pill and ignores unsupported providers", () => {
    const context = setup();
    registerUsagePills(context.client, TestPill);
    context.emit(upsert("agent-1", "workspace-1", "grok/grok-code"));
    context.emit(upsert("agent-2", "workspace-1", "claude/sonnet"));

    expect(context.addComposerPill).toHaveBeenCalledTimes(1);
    void context.registrations[0]?.onPress();
    expect(context.openSurface).toHaveBeenCalledWith("main");
  });

  it("does not restore a stale list entry after a newer removal update", async () => {
    const context = setup();
    let resolveList: (result: AgentListResult) => void = () => {};
    context.list.mockImplementationOnce(
      () => new Promise<AgentListResult>((resolve) => (resolveList = resolve)),
    );

    registerUsagePills(context.client, TestPill);
    context.emit({ kind: "remove", agentId: "agent-1" } as AgentUpdate);
    resolveList({
      entries: [{ agent: { id: "agent-1", workspaceId: "workspace-1", provider: "codex/gpt-5.4" } }],
    } as AgentListResult);
    await Promise.resolve();

    expect(context.addComposerPill).not.toHaveBeenCalled();
  });

  it("removes pills for archived agents and cleans up on dispose", () => {
    const context = setup();
    const dispose = registerUsagePills(context.client, TestPill);
    context.emit(upsert("agent-1", "workspace-1", "codex/gpt-5.4"));
    context.emit(upsert("agent-1", "workspace-1", "codex/gpt-5.4", "2026-09-04T00:00:00.000Z"));
    expect(context.removers[0]).toHaveBeenCalledTimes(1);
    context.emit(upsert("agent-2", "workspace-1", "grok"));
    dispose();
    expect(context.unsubscribe).toHaveBeenCalledTimes(1);
    expect(context.removers[1]).toHaveBeenCalledTimes(1);
  });
});
