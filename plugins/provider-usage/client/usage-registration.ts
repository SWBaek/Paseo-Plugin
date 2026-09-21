import type { PluginCleanup } from "@getpaseo/plugin";
import type { ComponentType } from "react";
import type {
  PluginClientContext,
  PluginButtonIconProps,
  PluginButton,
} from "@getpaseo/plugin/client";
import { parseAgentProviderId } from "../shared/provider-usage.logic";

export type RefreshUsage = () => Promise<void>;

interface RegisteredPill {
  workspaceId: string;
  providerId: string;
  remove: PluginCleanup;
}

export function registerUsagePills(
  client: PluginClientContext,
  createIcon: (update: (patch: Partial<PluginButton>) => void) => ComponentType<PluginButtonIconProps>,
  refreshUsage: RefreshUsage,
): PluginCleanup {
  const pills = new Map<string, RegisteredPill>();
  const updatedAgentIds = new Set<string>();
  let active = true;
  let enabled = new Set<string>();
  let catalogRequest = 0;
  const agents = new Map<string, { id: string; workspaceId?: string; archivedAt?: string | null; provider?: string | null }>();
  async function refreshConnections() {
    if (!active) return;
    const request = ++catalogRequest;
    try {
      const catalog = await client.paseo.providers.snapshot();
      if (!active || request !== catalogRequest) return;
      enabled = new Set(catalog.entries.filter((entry) => entry.enabled).map((entry) => entry.provider));
      for (const agent of agents.values()) syncPill(agent);
    } catch {
      // Keep the last verified catalog until the host reconnects.
    }
  }
  const unsubscribeProviders = client.paseo.providers.subscribe(() => { void refreshConnections(); });
  void refreshConnections();

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
    agents.set(agent.id, agent);
    const { id: agentId, workspaceId, archivedAt } = agent;
    const providerId = parseAgentProviderId(agent.provider);
    if (!workspaceId || archivedAt || (!providerId || !enabled.has(providerId))) {
      removePill(agentId);
      return;
    }

    const registered = pills.get(agentId);
    if (registered?.workspaceId === workspaceId && registered.providerId === providerId) return;

    removePill(agentId);
    let action: Promise<void> | undefined;
    let removed = false;
    const registration = client.addComposerPill({
      id: "usage",
      workspaceId,
      agentId,
      button: {
        title: "Refresh provider usage",
        label: "…",
        icon: createIcon(patch => registration.update(patch)),
        behavior: {
          kind: "action",
          onPress() {
            if (!active || removed) return;
            if (action) return action;
            action = refreshUsage().finally(() => {
              action = undefined;
            });
            return action;
          },
        },
      },
    });
    pills.set(agentId, { workspaceId, providerId, remove: () => { removed = true; registration.remove(); } });
  }

  const unsubscribe = client.paseo.agents.subscribe((update) => {
    if (!active) return;
    if (update.kind === "remove") {
      updatedAgentIds.add(update.agentId);
      agents.delete(update.agentId);
      removePill(update.agentId);
      return;
    }

    updatedAgentIds.add(update.agent.id);
    syncPill(update.agent);
  });

  let observation: { release(): Promise<void> } | undefined;
  void client.paseo.agents
    .list({ scope: "active", page: { limit: 200 }, subscribe: {} })
    .then(({ entries, subscription }) => {
      if (!active) {
        void subscription?.release();
        return;
      }
      observation = subscription;
      for (const { agent } of entries) {
        if (!updatedAgentIds.has(agent.id)) syncPill(agent);
      }
    })
    .catch(() => {
      // Live directory updates can still populate pills after a transient fetch failure.
    });

  return () => {
    if (!active) return;
    active = false;
    unsubscribe();
    unsubscribeProviders();
    void observation?.release();
    observation = undefined;
    agents.clear();
    for (const { remove } of pills.values()) void remove();
    pills.clear();
  };
}
