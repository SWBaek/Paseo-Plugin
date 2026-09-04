import type { PluginComposerPillProps } from "@getpaseo/plugin";
import { useAgent, useRpc } from "@getpaseo/plugin";
import { Icon } from "@getpaseo/plugin/react-native";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { Text } from "react-native";
import { findProviderUsage, parseAgentProviderId, pickPrimaryWindow } from "./provider-usage.logic";
import { providerUsageSnapshot } from "./provider-usage.shared";
import { pillLabel, toneColor } from "./provider-usage.view";

const QUERY_KEY = ["provider-usage", "snapshot"] as const;

export function UsagePill({ theme, agentId }: PluginComposerPillProps) {
  const providerValue = useAgent(agentId, (agent) => agent.provider);
  const providerId = parseAgentProviderId(providerValue);
  const snapshot = useRpc(providerUsageSnapshot);
  const query = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => snapshot({}),
    staleTime: 60_000,
  });
  const provider = findProviderUsage(query.data?.providers ?? [], providerId);
  const tone = pickPrimaryWindow(provider?.windows ?? [])?.tone ?? "default";
  const color = useMemo(() => toneColor(theme, tone), [theme, tone]);
  const label = pillLabel(provider ?? null, providerId);

  return (
    <>
      <Icon name="Gauge" size={14} color={color} />
      <Text numberOfLines={1} style={{ color, flexShrink: 1 }}>
        {label}
      </Text>
    </>
  );
}
