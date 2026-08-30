import type { ComponentType } from "react";
import type {
  PluginCleanup,
  PluginClientContext,
  PluginComposerPillProps,
} from "@getpaseo/plugin";

export const COMPACT_COMMAND = "/compact";

interface RegisteredPill {
  workspaceId: string;
  remove: PluginCleanup;
}

export function registerCompactPills(
  client: PluginClientContext,
  Component: ComponentType<PluginComposerPillProps>,
): PluginCleanup {
  const pills = new Map<string, RegisteredPill>();
  const updatedAgentIds = new Set<string>();
  let active = true;

  function removePill(agentId: string) {
    const registered = pills.get(agentId);
    if (!registered) return;

    pills.delete(agentId);
    void registered.remove();
  }

  function syncPill(agent: {
    id: string;
    workspaceId?: string;
    archivedAt?: string | null;
  }) {
    const { id: agentId, workspaceId, archivedAt } = agent;
    if (!workspaceId || archivedAt) {
      removePill(agentId);
      return;
    }

    const registered = pills.get(agentId);
    if (registered?.workspaceId === workspaceId) return;

    removePill(agentId);
    const remove = client.addComposerPill({
      id: "compact",
      title: "Compact agent context",
      workspaceId,
      agentId,
      Component,
      async onPress() {
        await client.paseo.agents.ref(agentId).send(COMPACT_COMMAND);
      },
    });
    pills.set(agentId, { workspaceId, remove });
  }

  const unsubscribe = client.paseo.agents.subscribe((update) => {
    if (update.kind === "remove") {
      updatedAgentIds.add(update.agentId);
      removePill(update.agentId);
      return;
    }

    updatedAgentIds.add(update.agent.id);
    syncPill(update.agent);
  });

  void client.paseo.agents
    .list({ scope: "active", page: { limit: 200 } })
    .then(({ entries }) => {
      if (!active) return;
      for (const { agent } of entries) {
        if (!updatedAgentIds.has(agent.id)) syncPill(agent);
      }
    })
    .catch(() => {
      // Live directory updates can still populate pills after a transient fetch failure.
    });

  return () => {
    active = false;
    unsubscribe();
    for (const { remove } of pills.values()) void remove();
    pills.clear();
  };
}
