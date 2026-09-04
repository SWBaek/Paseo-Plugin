import type { PluginSurfaceProps, PluginTheme } from "@getpaseo/plugin";
import { useRpc } from "@getpaseo/plugin";
import { Icon } from "@getpaseo/plugin/react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import React, { useMemo } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { ProviderUsage, UsageBalance, UsageWindow } from "./provider-usage.shared";
import { providerUsageSnapshot } from "./provider-usage.shared";
import {
  formatBalance,
  formatPercent,
  formatResetAt,
  snapshotStatus,
  toneColor,
  usageCopy,
} from "./provider-usage.view";
import { bindUsageQueryClient, usageQueryOptions } from "./usage-query";

function createStyles(theme: PluginTheme, compact: boolean) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.colors.surface0 },
    content: {
      width: "100%",
      padding: compact ? 16 : 24,
      paddingBottom: compact ? 32 : 48,
    },
    shell: {
      width: "100%",
      maxWidth: 720,
      alignSelf: "center",
      gap: 24,
    },
    intro: { gap: 12 },
    description: {
      color: theme.colors.foregroundMuted,
      fontSize: 12,
      lineHeight: 18,
      fontWeight: "400",
    },
    actions: { flexDirection: "row", alignItems: "center", gap: 8 },
    secondaryButton: {
      minHeight: 44,
      minWidth: compact ? 0 : 120,
      flex: compact ? 1 : 0,
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface2,
      flexDirection: "row",
      gap: 8,
      alignItems: "center",
      justifyContent: "center",
    },
    secondaryButtonText: {
      color: theme.colors.foreground,
      fontSize: 12,
      fontWeight: "500",
      textAlign: "center",
    },
    pressed: { opacity: 0.76 },
    disabled: { opacity: 0.5 },
    statusBlock: { gap: 4 },
    statusTitle: {
      color: theme.colors.foreground,
      fontSize: 14,
      lineHeight: 20,
      fontWeight: "600",
    },
    statusDescription: {
      color: theme.colors.foregroundMuted,
      fontSize: 12,
      lineHeight: 18,
    },
    cards: { gap: 16 },
    card: {
      borderRadius: 10,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface1,
      padding: compact ? 16 : 20,
      gap: 16,
    },
    cardHeader: { gap: 4 },
    cardTitle: {
      color: theme.colors.foreground,
      fontSize: 14,
      lineHeight: 20,
      fontWeight: "600",
    },
    cardMeta: {
      color: theme.colors.foregroundMuted,
      fontSize: 12,
      lineHeight: 18,
    },
    cardError: {
      color: theme.colors.statusDanger,
      fontSize: 12,
      lineHeight: 18,
    },
    reading: { gap: 8 },
    readingHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "baseline",
      gap: 12,
    },
    readingLabel: {
      color: theme.colors.foreground,
      fontSize: 12,
      lineHeight: 18,
      fontWeight: "500",
      flexShrink: 1,
    },
    readingValue: {
      color: theme.colors.foreground,
      fontSize: 12,
      lineHeight: 18,
      fontVariant: ["tabular-nums"],
    },
    meterTrack: {
      height: 8,
      borderRadius: 4,
      backgroundColor: theme.colors.surface2,
      overflow: "hidden",
    },
    meterFill: {
      height: 8,
      borderRadius: 4,
    },
    readingMeta: {
      color: theme.colors.foregroundMuted,
      fontSize: 10,
      lineHeight: 15,
    },
  });
}

function WindowReading({
  window,
  theme,
  styles,
}: {
  window: UsageWindow;
  theme: PluginTheme;
  styles: ReturnType<typeof createStyles>;
}) {
  const used = window.usedPercent;
  const width = `${Math.max(0, Math.min(100, typeof used === "number" ? used : 0))}%` as `${number}%`;
  const reset = formatResetAt(window.resetsAt);
  return (
    <View style={styles.reading}>
      <View style={styles.readingHeader}>
        <Text style={styles.readingLabel}>{window.label}</Text>
        <Text style={[styles.readingValue, { color: toneColor(theme, window.tone) }]}>
          {formatPercent(used)} used
        </Text>
      </View>
      <View style={styles.meterTrack}>
        <View
          style={[styles.meterFill, { width, backgroundColor: toneColor(theme, window.tone) }]}
        />
      </View>
      {reset ? <Text style={styles.readingMeta}>{reset}</Text> : null}
    </View>
  );
}

function BalanceReading({
  balance,
  theme,
  styles,
}: {
  balance: UsageBalance;
  theme: PluginTheme;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <View style={styles.reading}>
      <View style={styles.readingHeader}>
        <Text style={styles.readingLabel}>{balance.label}</Text>
        <Text style={[styles.readingValue, { color: toneColor(theme, balance.tone) }]}>
          {formatBalance(balance.remaining, balance.limit, balance.unit)}
        </Text>
      </View>
    </View>
  );
}

function ProviderCard({
  provider,
  theme,
  styles,
}: {
  provider: ProviderUsage;
  theme: PluginTheme;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>{provider.label}</Text>
        {provider.planLabel ? <Text style={styles.cardMeta}>{provider.planLabel}</Text> : null}
        {provider.status === "unavailable" ? (
          <Text style={styles.cardMeta}>{usageCopy("unavailable").description}</Text>
        ) : null}
        {provider.status === "error" ? (
          <Text style={styles.cardError}>{provider.error ?? usageCopy("error").description}</Text>
        ) : null}
      </View>
      {provider.windows.map((window) => (
        <WindowReading key={window.id} window={window} theme={theme} styles={styles} />
      ))}
      {provider.balances.map((balance) => (
        <BalanceReading key={balance.id} balance={balance} theme={theme} styles={styles} />
      ))}
    </View>
  );
}

export function MainSurface({ theme, layout }: PluginSurfaceProps) {
  const compact = layout.compact;
  const styles = useMemo(() => createStyles(theme, compact), [theme, compact]);
  const snapshot = useRpc(providerUsageSnapshot);
  bindUsageQueryClient(useQueryClient());
  const query = useQuery(usageQueryOptions(() => snapshot({})));
  const providers = query.data?.providers ?? [];
  const status = snapshotStatus(providers, query.isPending, query.isError);
  const copy = status === "available" ? null : usageCopy(status);
  const refreshing = query.isFetching && providers.length > 0;

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.shell}>
          <View style={styles.intro}>
            <Text style={styles.description}>
              Codex and Grok plan usage for the selected Host. This does not replace Settings →
              Usage.
            </Text>
            <View style={styles.actions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Refresh provider usage"
                disabled={query.isFetching}
                onPress={() => {
                  void query.refetch();
                }}
                style={({ pressed }) => [
                  styles.secondaryButton,
                  query.isFetching && styles.disabled,
                  pressed && styles.pressed,
                ]}
              >
                <Icon name="RefreshCw" size={16} color={theme.colors.foreground} />
                <Text style={styles.secondaryButtonText}>{refreshing ? "Refreshing" : "Refresh"}</Text>
              </Pressable>
            </View>
            {query.data?.fetchedAt ? (
              <Text style={styles.description}>
                Last read {new Date(query.data.fetchedAt).toLocaleString()}
              </Text>
            ) : null}
          </View>

          {copy ? (
            <View style={styles.statusBlock}>
              <Text
                style={[
                  styles.statusTitle,
                  status === "error" ? { color: theme.colors.statusDanger } : null,
                ]}
              >
                {copy.title}
              </Text>
              <Text style={styles.statusDescription}>
                {query.error instanceof Error ? query.error.message : copy.description}
              </Text>
            </View>
          ) : null}

          {providers.length > 0 ? (
            <View style={styles.cards}>
              {providers.map((provider) => (
                <ProviderCard key={provider.id} provider={provider} theme={theme} styles={styles} />
              ))}
            </View>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}
