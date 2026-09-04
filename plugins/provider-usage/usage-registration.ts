import type { ComponentType } from "react";
import type {
  PluginCleanup,
  PluginClientContext,
  PluginComposerPillProps,
} from "@getpaseo/plugin";
import { isSupportedProviderId, parseAgentProviderId } from "./provider-usage.logic";

export type RefreshUsage = () => Promise<void>;

interface RegisteredPill {
  workspaceId: string;
  providerId: string;
  remove: PluginCleanup;
}

export function registerUsagePills(
  client: PluginClientContext,
  Component: ComponentType<PluginComposerPillProps>,
  refreshUsage: RefreshUsage,
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
    provider?: string | null;
  }) {
    const { id: agentId, workspaceId, archivedAt } = agent;
    const providerId = parseAgentProviderId(agent.provider);
    if (!workspaceId || archivedAt || !isSupportedProviderId(providerId)) {
      removePill(agentId);
      return;
    }

    const registered = pills.get(agentId);
    if (registered?.workspaceId === workspaceId && registered.providerId === providerId) return;

    removePill(agentId);
    let action: Promise<void> | undefined;
    const remove = client.addComposerPill({
      id: "usage",
      title: "Refresh provider usage",
      workspaceId,
      agentId,
      Component,
      onPress() {
        if (action) return action;
        action = refreshUsage().finally(() => {
          action = undefined;
        });
        return action;
      },
    });
    pills.set(agentId, { workspaceId, providerId, remove });
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
