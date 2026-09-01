import type {
  PluginClientContext,
  PluginComposerPillContribution,
  PluginComposerPillProps,
} from "@getpaseo/plugin";
import type { ComponentType } from "react";
import { describe, expect, it, vi } from "vitest";
import { registerSkillsPills } from "./skills-registration";

type AgentUpdate = Parameters<
  Parameters<PluginClientContext["paseo"]["agents"]["subscribe"]>[0]
>[0];
type AgentListResult = Awaited<
  ReturnType<PluginClientContext["paseo"]["agents"]["list"]>
>;

const TestPill = (() => null) as ComponentType<PluginComposerPillProps>;

function setup() {
  let emit: (update: AgentUpdate) => void = () => {};
  const unsubscribe = vi.fn();
  const send = vi.fn(async () => {});
  const commands = vi.fn(async () => ({ commands: [], error: null }));
  const ref = vi.fn(() => ({ send, commands }));
  const requestModal = vi.fn(async () => true);
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
    paseo: { agents: { list, ref, subscribe } },
  } as unknown as PluginClientContext;

  return {
    client,
    emit(update: AgentUpdate) {
      emit(update);
    },
    unsubscribe,
    send,
    ref,
    requestModal,
    list,
    registrations,
    removers,
    addComposerPill,
  };
}

function upsert(agentId: string, workspaceId?: string, archivedAt: string | null = null) {
  return {
    kind: "upsert",
    agent: { id: agentId, workspaceId, archivedAt },
  } as AgentUpdate;
}

describe("skills composer pill registration", () => {
  it("registers pills for agents that were active before the plugin loaded", async () => {
    const context = setup();
    context.list.mockResolvedValueOnce({
      entries: [{ agent: { id: "agent-1", workspaceId: "workspace-1" } }],
    } as AgentListResult);

    registerSkillsPills(context.client, TestPill, context.requestModal);
    await Promise.resolve();

    expect(context.addComposerPill).toHaveBeenCalledTimes(1);
    expect(context.registrations[0]).toMatchObject({
      id: "skills",
      workspaceId: "workspace-1",
      agentId: "agent-1",
    });
  });

  it("does not restore a stale list entry after a newer removal update", async () => {
    const context = setup();
    let resolveList: (result: AgentListResult) => void = () => {};
    context.list.mockImplementationOnce(
      () => new Promise<AgentListResult>((resolve) => (resolveList = resolve)),
    );

    registerSkillsPills(context.client, TestPill, context.requestModal);
    context.emit({ kind: "remove", agentId: "agent-1" } as AgentUpdate);
    resolveList({
      entries: [{ agent: { id: "agent-1", workspaceId: "workspace-1" } }],
    } as AgentListResult);
    await Promise.resolve();

    expect(context.addComposerPill).not.toHaveBeenCalled();
  });

  it("opens the modal and never sends a prompt", async () => {
    const context = setup();
    registerSkillsPills(context.client, TestPill, context.requestModal);
    context.emit(upsert("agent-1", "workspace-1"));

    await context.registrations[0]?.onPress();

    expect(context.requestModal).toHaveBeenCalledWith("agent-1");
    expect(context.ref).not.toHaveBeenCalled();
    expect(context.send).not.toHaveBeenCalled();
  });

  it("does not send when the modal is dismissed", async () => {
    const context = setup();
    context.requestModal.mockResolvedValueOnce(false);
    registerSkillsPills(context.client, TestPill, context.requestModal);
    context.emit(upsert("agent-1", "workspace-1"));

    await context.registrations[0]?.onPress();

    expect(context.requestModal).toHaveBeenCalledWith("agent-1");
    expect(context.send).not.toHaveBeenCalled();
  });

  it("shares an in-flight modal so duplicate presses do not stack", async () => {
    const context = setup();
    let finish: (confirmed: boolean) => void = () => {};
    context.requestModal.mockImplementationOnce(
      () => new Promise<boolean>((resolve) => (finish = resolve)),
    );
    registerSkillsPills(context.client, TestPill, context.requestModal);
    context.emit(upsert("agent-1", "workspace-1"));

    const firstPress = context.registrations[0]?.onPress();
    const secondPress = context.registrations[0]?.onPress();
    expect(context.requestModal).toHaveBeenCalledTimes(1);

    finish(true);
    await Promise.all([firstPress, secondPress]);
    expect(context.send).not.toHaveBeenCalled();
  });

  it("keeps one pill while an agent remains in the same workspace", () => {
    const context = setup();
    registerSkillsPills(context.client, TestPill, context.requestModal);

    context.emit(upsert("agent-1", "workspace-1"));
    context.emit(upsert("agent-1", "workspace-1"));

    expect(context.addComposerPill).toHaveBeenCalledTimes(1);
    expect(context.removers[0]).not.toHaveBeenCalled();
  });

  it("rebinds or removes a pill when agent placement changes", () => {
    const context = setup();
    registerSkillsPills(context.client, TestPill, context.requestModal);

    context.emit(upsert("agent-1", "workspace-1"));
    context.emit(upsert("agent-1", "workspace-2"));
    expect(context.removers[0]).toHaveBeenCalledTimes(1);
    expect(context.registrations[1]?.workspaceId).toBe("workspace-2");

    context.emit({ kind: "remove", agentId: "agent-1" } as AgentUpdate);
    expect(context.removers[1]).toHaveBeenCalledTimes(1);
  });

  it("does not keep pills for unplaced or archived agents", () => {
    const context = setup();
    registerSkillsPills(context.client, TestPill, context.requestModal);

    context.emit(upsert("agent-1", "workspace-1"));
    context.emit(upsert("agent-1", undefined));
    expect(context.removers[0]).toHaveBeenCalledTimes(1);

    context.emit(upsert("agent-2", "workspace-2", "2026-08-31T00:00:00.000Z"));
    expect(context.addComposerPill).toHaveBeenCalledTimes(1);
  });

  it("unsubscribes and removes all pills during cleanup", () => {
    const context = setup();
    const cleanup = registerSkillsPills(
      context.client,
      TestPill,
      context.requestModal,
    );

    context.emit(upsert("agent-1", "workspace-1"));
    context.emit(upsert("agent-2", "workspace-2"));
    cleanup();

    expect(context.unsubscribe).toHaveBeenCalledTimes(1);
    expect(context.removers[0]).toHaveBeenCalledTimes(1);
    expect(context.removers[1]).toHaveBeenCalledTimes(1);
  });
});
