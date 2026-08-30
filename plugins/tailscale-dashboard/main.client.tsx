import type {
  DashboardHealth,
  DashboardSnapshot,
} from "./tailscale-dashboard.shared";
import type { PluginSurfaceProps, PluginTheme } from "@getpaseo/plugin";
import { Icon, useRpc } from "@getpaseo/plugin";
import { useQuery } from "@tanstack/react-query";
import React, { useMemo, useState } from "react";
import {
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { tailscaleDashboardDiscover } from "./tailscale-dashboard.shared";
import {
  canOpenDashboard,
  discoveryCopy,
  discoveryTone,
  visiblePeers,
} from "./tailscale-dashboard.view";

const CLIENT_REACHABILITY_TIMEOUT_MS = 5_000;

async function verifyClientReachability(
  url: string,
  platform: "ios" | "android" | "web",
): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CLIENT_REACHABILITY_TIMEOUT_MS);
  try {
    const request: RequestInit = {
      method: "HEAD",
      cache: "no-store",
      redirect: "manual",
      signal: controller.signal,
    };
    if (platform === "web") {
      request.mode = "no-cors";
    }
    const response = await fetch(url, request);
    if (platform !== "web" && !response.ok) {
      throw new Error("Dashboard endpoint is not reachable.");
    }
  } finally {
    clearTimeout(timer);
  }
}

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
      maxWidth: 1080,
      alignSelf: "center",
      gap: 24,
    },
    introduction: { gap: 8 },
    description: {
      color: theme.colors.foreground,
      fontSize: 14,
      lineHeight: 21,
      fontWeight: "400",
    },
    metadata: {
      color: theme.colors.foregroundMuted,
      fontSize: 12,
      lineHeight: 18,
      fontWeight: "400",
    },
    statusCard: {
      borderRadius: 10,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface1,
      padding: compact ? 16 : 24,
      gap: 16,
    },
    statusHeader: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 12,
    },
    statusIcon: {
      width: 36,
      height: 36,
      borderRadius: 8,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.colors.surface2,
    },
    statusCopy: { flex: 1, minWidth: 0, gap: 4 },
    statusTitle: {
      color: theme.colors.foreground,
      fontSize: 14,
      lineHeight: 20,
      fontWeight: "600",
    },
    statusTitleSuccess: { color: theme.colors.statusSuccess },
    statusTitleWarning: { color: theme.colors.statusWarning },
    statusTitleDanger: { color: theme.colors.statusDanger },
    statusDescription: {
      color: theme.colors.foregroundMuted,
      fontSize: 12,
      lineHeight: 18,
      fontWeight: "400",
    },
    facts: {
      borderTopWidth: 1,
      borderTopColor: theme.colors.border,
      paddingTop: 12,
      flexDirection: compact ? "column" : "row",
      gap: compact ? 8 : 24,
    },
    fact: { flex: 1, gap: 2 },
    factLabel: {
      color: theme.colors.foregroundMuted,
      fontSize: 10,
      lineHeight: 15,
      fontWeight: "500",
    },
    factValue: {
      color: theme.colors.foreground,
      fontSize: 12,
      lineHeight: 18,
      fontWeight: "400",
    },
    actions: {
      flexDirection: compact ? "column" : "row",
      gap: 8,
    },
    primaryButton: {
      minHeight: 44,
      flex: compact ? 0 : 1,
      borderRadius: 8,
      paddingHorizontal: 16,
      paddingVertical: 12,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      backgroundColor: theme.colors.accent,
    },
    primaryButtonText: {
      color: theme.colors.accentForeground,
      fontSize: 12,
      lineHeight: 18,
      fontWeight: "500",
      textAlign: "center",
    },
    secondaryButton: {
      minHeight: 44,
      flex: compact ? 0 : 1,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: theme.colors.border,
      paddingHorizontal: 16,
      paddingVertical: 12,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      backgroundColor: theme.colors.surface2,
    },
    secondaryButtonText: {
      color: theme.colors.foreground,
      fontSize: 12,
      lineHeight: 18,
      fontWeight: "500",
      textAlign: "center",
    },
    pressed: { opacity: 0.76 },
    disabled: { opacity: 0.5 },
    summaryGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: compact ? 8 : 12,
    },
    metricCard: {
      minWidth: compact ? 136 : 176,
      flexGrow: 1,
      flexBasis: compact ? 136 : 176,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface1,
      padding: 16,
      gap: 4,
    },
    metricValue: {
      color: theme.colors.foreground,
      fontSize: compact ? 20 : 24,
      lineHeight: compact ? 28 : 32,
      fontWeight: "500",
      fontVariant: ["tabular-nums"],
    },
    metricLabel: {
      color: theme.colors.foregroundMuted,
      fontSize: 12,
      lineHeight: 18,
      fontWeight: "500",
    },
    metricHint: {
      color: theme.colors.foregroundMuted,
      fontSize: 10,
      lineHeight: 15,
      fontWeight: "400",
    },
    section: {
      borderRadius: 10,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface1,
      overflow: "hidden",
    },
    sectionHeader: {
      paddingHorizontal: compact ? 16 : 20,
      paddingVertical: 16,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
    },
    sectionHeadingCopy: { flex: 1, minWidth: 0, gap: 2 },
    sectionTitle: {
      color: theme.colors.foreground,
      fontSize: 14,
      lineHeight: 20,
      fontWeight: "600",
    },
    sectionDescription: {
      color: theme.colors.foregroundMuted,
      fontSize: 12,
      lineHeight: 18,
      fontWeight: "400",
    },
    sectionCount: {
      color: theme.colors.foregroundMuted,
      fontSize: 12,
      lineHeight: 18,
      fontWeight: "500",
      fontVariant: ["tabular-nums"],
    },
    row: {
      paddingHorizontal: compact ? 16 : 20,
      paddingVertical: 14,
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 12,
      borderTopWidth: 1,
      borderTopColor: theme.colors.border,
    },
    rowIcon: {
      width: 28,
      height: 28,
      borderRadius: 6,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.colors.surface2,
    },
    rowCopy: { flex: 1, minWidth: 0, gap: 3 },
    rowTitleLine: {
      flexDirection: "row",
      flexWrap: "wrap",
      alignItems: "center",
      gap: 8,
    },
    rowTitle: {
      color: theme.colors.foreground,
      fontSize: 14,
      lineHeight: 20,
      fontWeight: "500",
    },
    rowState: {
      fontSize: 10,
      lineHeight: 15,
      fontWeight: "600",
    },
    rowDetail: {
      color: theme.colors.foregroundMuted,
      fontSize: 12,
      lineHeight: 18,
      fontWeight: "400",
    },
    rowMetadata: {
      color: theme.colors.foregroundMuted,
      fontSize: 10,
      lineHeight: 15,
      fontWeight: "400",
    },
    emptyState: {
      borderTopWidth: 1,
      borderTopColor: theme.colors.border,
      paddingHorizontal: compact ? 16 : 20,
      paddingVertical: 20,
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 12,
    },
    emptyText: {
      flex: 1,
      minWidth: 0,
      color: theme.colors.foregroundMuted,
      fontSize: 12,
      lineHeight: 18,
      fontWeight: "400",
    },
    expandButton: {
      minHeight: 44,
      borderTopWidth: 1,
      borderTopColor: theme.colors.border,
      paddingHorizontal: 16,
      paddingVertical: 12,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      backgroundColor: theme.colors.surface2,
    },
    expandButtonText: {
      color: theme.colors.foreground,
      fontSize: 12,
      lineHeight: 18,
      fontWeight: "500",
    },
    notice: {
      borderRadius: 8,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface1,
      padding: 16,
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 12,
    },
    noticeError: { borderColor: theme.colors.statusDanger },
    noticeText: {
      flex: 1,
      minWidth: 0,
      color: theme.colors.foregroundMuted,
      fontSize: 12,
      lineHeight: 18,
      fontWeight: "400",
    },
    noticeErrorText: { color: theme.colors.statusDanger },
  });
}

function statusIcon(status: ReturnType<typeof discoveryCopy>["status"]): string {
  switch (status) {
    case "available":
      return "CircleCheck";
    case "loading":
      return "Search";
    case "multiple":
    case "tailscale_disconnected":
    case "verification_timeout":
      return "TriangleAlert";
    default:
      return "CircleX";
  }
}

function healthColor(theme: PluginTheme, health: DashboardHealth): string {
  return health === "healthy"
    ? theme.colors.statusSuccess
    : health === "warning"
      ? theme.colors.statusWarning
      : theme.colors.statusDanger;
}

function healthLabel(health: DashboardHealth | null): string {
  return health === "healthy"
    ? "정상"
    : health === "warning"
      ? "주의"
      : health === "error"
        ? "오류"
        : "확인되지 않음";
}

function formatPeerMetadata(peer: DashboardSnapshot["peers"][number]): string {
  const details = [peer.os, peer.connection];
  if (peer.relay) {
    details.push(`릴레이 ${peer.relay}`);
  }
  if (peer.latencyMs !== null) {
    details.push(`${Math.round(peer.latencyMs)}ms`);
  }
  if (!peer.online && peer.lastSeen) {
    details.push(`마지막 연결 ${peer.lastSeen}`);
  }
  return details.join(" · ");
}

export function MainSurface({ theme, layout, host }: PluginSurfaceProps) {
  const discover = useRpc(tailscaleDashboardDiscover);
  const query = useQuery({
    queryKey: ["tailscale-dashboard", "discovery"],
    queryFn: () => discover({}),
    retry: false,
    staleTime: 30_000,
  });
  const [opening, setOpening] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);
  const [peersExpanded, setPeersExpanded] = useState(false);
  const styles = useMemo(
    () => createStyles(theme, layout.compact),
    [theme, layout.compact],
  );
  const copy = query.isPending
    ? discoveryCopy("loading")
    : query.isError
      ? discoveryCopy("command_failed")
      : discoveryCopy(query.data.status);
  const tone = query.data
    ? discoveryTone(query.data.status, query.data.dashboardHealth)
    : query.isError
      ? "danger"
      : "neutral";
  const toneColor =
    tone === "success"
      ? theme.colors.statusSuccess
      : tone === "warning"
        ? theme.colors.statusWarning
        : tone === "danger"
          ? theme.colors.statusDanger
          : theme.colors.foregroundMuted;
  const openEnabled = Boolean(query.data && canOpenDashboard(query.data));
  const busy = query.isFetching || opening;
  const dashboard = query.data?.dashboard ?? null;
  const peers = dashboard
    ? visiblePeers(dashboard.peers, peersExpanded, layout.compact)
    : [];

  async function openDashboard(): Promise<void> {
    const url = query.data?.url;
    if (!url || !openEnabled || busy) {
      return;
    }
    setOpening(true);
    setOpenError(null);
    try {
      await verifyClientReachability(url, layout.platform);
      const supported = await Linking.canOpenURL(url);
      if (!supported) {
        throw new Error("No application can open the Dashboard URL.");
      }
      await Linking.openURL(url);
    } catch {
      setOpenError(
        "전체 Dashboard를 열지 못했습니다. 이 기기의 Tailscale 연결과 기본 브라우저 설정을 확인하세요.",
      );
    } finally {
      setOpening(false);
    }
  }

  async function refresh(): Promise<void> {
    if (busy) {
      return;
    }
    setOpenError(null);
    await query.refetch();
  }

  const checkedAt = query.data
    ? new Date(query.data.checkedAt).toLocaleString("ko-KR")
    : "아직 확인되지 않음";
  const generatedAt = dashboard
    ? new Date(dashboard.generatedAt).toLocaleString("ko-KR")
    : null;
  const summary = dashboard
    ? [
        {
          label: "온라인 피어",
          value: `${dashboard.summary.onlinePeers}/${dashboard.summary.totalPeers}`,
          hint: "현재 연결된 Tailnet 장치",
        },
        {
          label: "Serve 서비스",
          value: String(dashboard.summary.serveServices),
          hint: "이 Host가 게시하는 서비스",
        },
        {
          label: "보호 서비스",
          value: String(dashboard.summary.protectedServices),
          hint: "상태를 확인한 backend",
        },
        {
          label: "경고",
          value: String(dashboard.summary.warningCount),
          hint: dashboard.summary.warningCount === 0 ? "확인할 경고 없음" : "검토가 필요한 항목",
        },
      ]
    : [];

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.shell}>
        <View style={styles.introduction}>
          <Text style={styles.description}>
            선택한 Paseo Host에서 검증된 TailscaleOps 상태를 읽어 핵심 Tailnet 현황을
            표시합니다.
          </Text>
          <Text style={styles.metadata}>선택된 Host · {host.label}</Text>
        </View>

        <View style={styles.statusCard}>
          <View style={styles.statusHeader}>
            <View style={styles.statusIcon}>
              <Icon name={statusIcon(copy.status)} size={20} color={toneColor} />
            </View>
            <View style={styles.statusCopy}>
              <Text
                accessibilityLiveRegion="polite"
                style={[
                  styles.statusTitle,
                  tone === "success" && styles.statusTitleSuccess,
                  tone === "warning" && styles.statusTitleWarning,
                  tone === "danger" && styles.statusTitleDanger,
                ]}
              >
                {query.isFetching && query.data ? "현황을 다시 확인하는 중" : copy.title}
              </Text>
              <Text style={styles.statusDescription}>
                {dashboard?.overall.message ?? copy.description}
              </Text>
            </View>
          </View>

          <View style={styles.facts}>
            <View style={styles.fact}>
              <Text style={styles.factLabel}>마지막 확인</Text>
              <Text style={styles.factValue}>{checkedAt}</Text>
            </View>
            <View style={styles.fact}>
              <Text style={styles.factLabel}>Dashboard 상태</Text>
              <Text style={styles.factValue}>{healthLabel(query.data?.dashboardHealth ?? null)}</Text>
            </View>
            {dashboard ? (
              <View style={styles.fact}>
                <Text style={styles.factLabel}>장치</Text>
                <Text style={styles.factValue}>
                  {dashboard.device.name} · {dashboard.device.os}
                  {dashboard.device.version ? ` ${dashboard.device.version}` : ""}
                </Text>
              </View>
            ) : null}
          </View>

          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Tailnet 현황 다시 확인"
              accessibilityState={{ disabled: busy, busy: query.isFetching }}
              disabled={busy}
              onPress={() => void refresh()}
              style={({ pressed }) => [
                styles.primaryButton,
                busy && styles.disabled,
                pressed && !busy && styles.pressed,
              ]}
            >
              <Icon name="RefreshCw" size={18} color={theme.colors.accentForeground} />
              <Text style={styles.primaryButtonText}>
                {query.isFetching ? "확인 중" : "현황 새로고침"}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="전체 TailscaleOps Dashboard를 시스템 브라우저에서 열기"
              accessibilityState={{ disabled: !openEnabled || busy, busy: opening }}
              disabled={!openEnabled || busy}
              onPress={() => void openDashboard()}
              style={({ pressed }) => [
                styles.secondaryButton,
                (!openEnabled || busy) && styles.disabled,
                pressed && openEnabled && !busy && styles.pressed,
              ]}
            >
              <Icon name="ExternalLink" size={18} color={theme.colors.foreground} />
              <Text style={styles.secondaryButtonText}>
                {opening ? "여는 중" : "전체 Dashboard 열기"}
              </Text>
            </Pressable>
          </View>
        </View>

        {dashboard ? (
          <>
            <View style={styles.summaryGrid}>
              {summary.map((metric) => (
                <View key={metric.label} style={styles.metricCard}>
                  <Text style={styles.metricValue}>{metric.value}</Text>
                  <Text style={styles.metricLabel}>{metric.label}</Text>
                  <Text style={styles.metricHint}>{metric.hint}</Text>
                </View>
              ))}
            </View>

            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <View style={styles.sectionHeadingCopy}>
                  <Text style={styles.sectionTitle}>보호 서비스</Text>
                  <Text style={styles.sectionDescription}>listener와 backend 상태</Text>
                </View>
                <Text style={styles.sectionCount}>{dashboard.services.length}개</Text>
              </View>
              {dashboard.services.length === 0 ? (
                <View style={styles.emptyState}>
                  <Icon name="Server" size={18} color={theme.colors.foregroundMuted} />
                  <Text style={styles.emptyText}>표시할 보호 서비스가 없습니다.</Text>
                </View>
              ) : (
                dashboard.services.map((service, index) => {
                  const color = healthColor(theme, service.status);
                  const listener = service.listenerHealthy ? "listener 정상" : "listener 오류";
                  const backend =
                    service.backendHealthy === null
                      ? "backend 미확인"
                      : service.backendHealthy
                        ? "backend 정상"
                        : "backend 오류";
                  return (
                    <View key={`${service.name}-${index}`} style={styles.row}>
                      <View style={styles.rowIcon}>
                        <Icon
                          name={service.status === "healthy" ? "CircleCheck" : "TriangleAlert"}
                          size={16}
                          color={color}
                        />
                      </View>
                      <View style={styles.rowCopy}>
                        <View style={styles.rowTitleLine}>
                          <Text style={styles.rowTitle}>{service.name}</Text>
                          <Text style={[styles.rowState, { color }]}>
                            {healthLabel(service.status)}
                          </Text>
                        </View>
                        <Text style={styles.rowDetail}>{service.detail}</Text>
                        <Text style={styles.rowMetadata}>
                          {service.mode} · {listener} · {backend}
                        </Text>
                      </View>
                    </View>
                  );
                })
              )}
            </View>

            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <View style={styles.sectionHeadingCopy}>
                  <Text style={styles.sectionTitle}>경고</Text>
                  <Text style={styles.sectionDescription}>확인이 필요한 Tailnet 상태</Text>
                </View>
                <Text style={styles.sectionCount}>{dashboard.summary.warningCount}개</Text>
              </View>
              {dashboard.warnings.length === 0 ? (
                <View style={styles.emptyState}>
                  <Icon name="ShieldCheck" size={18} color={theme.colors.statusSuccess} />
                  <Text style={styles.emptyText}>현재 확인할 경고가 없습니다.</Text>
                </View>
              ) : (
                dashboard.warnings.map((warning, index) => {
                  const color =
                    warning.severity === "error"
                      ? theme.colors.statusDanger
                      : theme.colors.statusWarning;
                  return (
                    <View key={`${warning.title}-${index}`} style={styles.row}>
                      <View style={styles.rowIcon}>
                        <Icon name="TriangleAlert" size={16} color={color} />
                      </View>
                      <View style={styles.rowCopy}>
                        <Text style={[styles.rowTitle, { color }]}>{warning.title}</Text>
                        <Text style={styles.rowDetail}>{warning.detail}</Text>
                      </View>
                    </View>
                  );
                })
              )}
            </View>

            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <View style={styles.sectionHeadingCopy}>
                  <Text style={styles.sectionTitle}>Tailnet 피어</Text>
                  <Text style={styles.sectionDescription}>온라인 장치를 먼저 표시</Text>
                </View>
                <Text style={styles.sectionCount}>
                  {dashboard.summary.onlinePeers}/{dashboard.summary.totalPeers} 온라인
                </Text>
              </View>
              {dashboard.peers.length === 0 ? (
                <View style={styles.emptyState}>
                  <Icon name="Users" size={18} color={theme.colors.foregroundMuted} />
                  <Text style={styles.emptyText}>표시할 Tailnet 피어가 없습니다.</Text>
                </View>
              ) : (
                peers.map((peer, index) => {
                  const color = peer.online
                    ? theme.colors.statusSuccess
                    : theme.colors.foregroundMuted;
                  return (
                    <View key={`${peer.name}-${index}`} style={styles.row}>
                      <View style={styles.rowIcon}>
                        <Icon name={peer.online ? "Wifi" : "WifiOff"} size={16} color={color} />
                      </View>
                      <View style={styles.rowCopy}>
                        <View style={styles.rowTitleLine}>
                          <Text style={styles.rowTitle}>{peer.name}</Text>
                          <Text style={[styles.rowState, { color }]}>
                            {peer.online ? "온라인" : "오프라인"}
                          </Text>
                        </View>
                        <Text style={styles.rowMetadata}>{formatPeerMetadata(peer)}</Text>
                      </View>
                    </View>
                  );
                })
              )}
              {dashboard.peers.length > (layout.compact ? 8 : 12) ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={peersExpanded ? "피어 목록 접기" : "모든 피어 보기"}
                  accessibilityState={{ expanded: peersExpanded }}
                  onPress={() => setPeersExpanded((expanded) => !expanded)}
                  style={({ pressed }) => [styles.expandButton, pressed && styles.pressed]}
                >
                  <Icon
                    name={peersExpanded ? "ChevronUp" : "ChevronDown"}
                    size={16}
                    color={theme.colors.foreground}
                  />
                  <Text style={styles.expandButtonText}>
                    {peersExpanded
                      ? "피어 목록 접기"
                      : `나머지 ${dashboard.peers.length - peers.length}개 보기`}
                  </Text>
                </Pressable>
              ) : null}
            </View>

            <View style={styles.notice}>
              <Icon name="ShieldCheck" size={18} color={theme.colors.foregroundMuted} />
              <Text style={styles.noticeText}>
                {generatedAt}에 생성된 최소 상태만 표시합니다. 주소, 포트, 프로세스와 backend
                URL은 Paseo 클라이언트로 전달하지 않습니다. 원본은 {dashboard.refreshIntervalSeconds}초
                간격으로 갱신됩니다.
              </Text>
            </View>
          </>
        ) : null}

        {openError ? (
          <View style={[styles.notice, styles.noticeError]} accessibilityLiveRegion="assertive">
            <Icon name="CircleX" size={18} color={theme.colors.statusDanger} />
            <Text style={[styles.noticeText, styles.noticeErrorText]}>{openError}</Text>
          </View>
        ) : null}

        <View style={styles.notice}>
          <Icon name="ExternalLink" size={18} color={theme.colors.foregroundMuted} />
          <Text style={styles.noticeText}>
            전체 Dashboard는 시스템 브라우저에서 열립니다. 브라우저를 여는 기기도 같은 Tailnet에
            연결되어 있어야 합니다.
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}
