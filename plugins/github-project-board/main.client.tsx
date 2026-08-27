import { type PluginSurfaceProps, type PluginTheme, useRpc } from "@getpaseo/plugin";
import { useQuery } from "@tanstack/react-query";
import React, { type ReactNode, useCallback, useMemo, useState } from "react";
import {
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import {
  githubProjectBoardScan,
  type GithubIssueCard,
  type GithubProjectColumn,
} from "./github-project-board.shared";
import {
  countColumnIssues,
  filterProjectColumns,
  isNativePluginPlatform,
  selectIssuePage,
} from "./github-project-board.view";

function createStyles(theme: PluginTheme, compact: boolean) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.colors.surface0 },
    nativeScreen: { overflow: "hidden" },
    content: {
      width: "100%",
      paddingHorizontal: compact ? 12 : 28,
      paddingTop: compact ? 14 : 24,
      paddingBottom: compact ? 32 : 52,
    },
    shell: { width: "100%", maxWidth: 1640, alignSelf: "center", gap: compact ? 14 : 18 },
    nativeShell: { flex: 1 },
    tintedSurface: { position: "relative", overflow: "hidden" },
    tintLayer: { ...StyleSheet.absoluteFillObject },
    header: { gap: 14, paddingBottom: compact ? 4 : 8 },
    nativeHeader: { gap: 8, paddingBottom: 0 },
    headerTop: {
      flexDirection: compact ? "column" : "row",
      alignItems: compact ? "stretch" : "flex-start",
      justifyContent: "space-between",
      gap: 14,
    },
    headerCopy: { flex: 1, minWidth: 0, gap: 5 },
    eyebrow: {
      color: theme.colors.foregroundMuted,
      fontSize: 10,
      fontWeight: "900",
      letterSpacing: 1.35,
    },
    title: {
      color: theme.colors.foreground,
      fontSize: compact ? 27 : 33,
      lineHeight: compact ? 33 : 40,
      fontWeight: "800",
      letterSpacing: -0.8,
    },
    subtitle: { color: theme.colors.foregroundMuted, fontSize: 13, lineHeight: 19 },
    headerActions: {
      flexDirection: "row",
      alignItems: "center",
      alignSelf: compact ? "stretch" : "flex-start",
      gap: 8,
    },
    secondaryButton: {
      minHeight: 38,
      minWidth: compact ? 0 : 146,
      flex: compact ? 1 : 0,
      paddingHorizontal: 14,
      paddingVertical: 9,
      borderRadius: 9,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: theme.colors.foregroundMuted,
    },
    secondaryButtonText: { color: theme.colors.foreground, fontSize: 12, fontWeight: "800" },
    primaryButton: {
      minHeight: 38,
      minWidth: compact ? 0 : 132,
      flex: compact ? 1 : 0,
      paddingHorizontal: 15,
      paddingVertical: 9,
      borderRadius: 9,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.colors.accent,
    },
    primaryButtonText: { color: theme.colors.accentForeground, fontSize: 12, fontWeight: "800" },
    pressed: { opacity: 0.76 },
    disabled: { opacity: 0.5 },
    metadata: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8 },
    readOnlyPill: {
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 999,
      backgroundColor: theme.colors.accent,
    },
    readOnlyText: {
      color: theme.colors.accentForeground,
      fontSize: 9,
      fontWeight: "900",
      letterSpacing: 0.7,
    },
    metaText: { color: theme.colors.foregroundMuted, fontSize: 11, lineHeight: 16 },
    dot: {
      width: 3,
      height: 3,
      borderRadius: 999,
      backgroundColor: theme.colors.foregroundMuted,
      opacity: 0.55,
    },
    divider: { height: 1, backgroundColor: theme.colors.foregroundMuted, opacity: 0.16 },
    toolbar: {
      flexDirection: compact ? "column" : "row",
      alignItems: compact ? "stretch" : "center",
      justifyContent: "space-between",
      gap: 12,
    },
    searchBox: {
      flex: compact ? 0 : 1,
      maxWidth: compact ? undefined : 520,
      minHeight: 42,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: theme.colors.foregroundMuted,
      justifyContent: "center",
      paddingHorizontal: 13,
    },
    searchInput: {
      color: theme.colors.foreground,
      fontSize: 13,
      padding: 0,
    },
    resultText: { color: theme.colors.foregroundMuted, fontSize: 11, lineHeight: 17 },
    callout: { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, gap: 4 },
    calloutRail: {
      position: "absolute",
      top: 0,
      bottom: 0,
      left: 0,
      width: 3,
      backgroundColor: theme.colors.statusDanger,
    },
    calloutTitle: { color: theme.colors.statusDanger, fontSize: 12, fontWeight: "800" },
    calloutText: { color: theme.colors.foregroundMuted, fontSize: 11, lineHeight: 17 },
    boardScroll: { width: "100%" },
    board: { flexDirection: "row", alignItems: "flex-start", gap: 14, paddingBottom: 8 },
    column: { width: 310, borderRadius: 12, padding: 10, gap: 10 },
    compactColumn: { width: "100%" },
    columnHeader: {
      minHeight: 36,
      paddingHorizontal: 3,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 8,
    },
    columnIdentity: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 8 },
    columnMarker: { width: 7, height: 7, borderRadius: 999, backgroundColor: theme.colors.accent },
    columnTitle: { flex: 1, color: theme.colors.foreground, fontSize: 13, fontWeight: "800" },
    columnCount: {
      minWidth: 25,
      paddingHorizontal: 7,
      paddingVertical: 3,
      borderRadius: 999,
      color: theme.colors.foreground,
      fontSize: 10,
      fontWeight: "800",
      textAlign: "center",
      borderWidth: 1,
      borderColor: theme.colors.foregroundMuted,
    },
    cardList: { gap: 8 },
    card: { borderRadius: 9, paddingHorizontal: 12, paddingVertical: 11, gap: 8 },
    cardIdentity: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 5 },
    repository: { color: theme.colors.foregroundMuted, fontSize: 10, fontWeight: "700" },
    issueNumber: { color: theme.colors.accent, fontSize: 10, fontWeight: "900" },
    cardTitle: { color: theme.colors.foreground, fontSize: 13, lineHeight: 18, fontWeight: "700" },
    tagRow: { flexDirection: "row", flexWrap: "wrap", gap: 5 },
    tag: {
      paddingHorizontal: 7,
      paddingVertical: 3,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.colors.foregroundMuted,
    },
    tagAccent: { backgroundColor: theme.colors.accent, borderColor: theme.colors.accent },
    tagText: { color: theme.colors.foregroundMuted, fontSize: 9, fontWeight: "700" },
    tagTextAccent: { color: theme.colors.accentForeground },
    assigneeText: { color: theme.colors.foregroundMuted, fontSize: 10, lineHeight: 15 },
    emptyColumn: {
      minHeight: 90,
      paddingHorizontal: 12,
      paddingVertical: 18,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 9,
    },
    emptyColumnText: {
      color: theme.colors.foregroundMuted,
      fontSize: 11,
      lineHeight: 17,
      textAlign: "center",
    },
    tabs: { width: "100%" },
    tabList: { flexDirection: "row", gap: 7, paddingBottom: 2 },
    nativeTabList: { width: "100%", flexDirection: "row", flexWrap: "wrap", gap: 7 },
    tab: {
      minHeight: 34,
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 11,
      paddingVertical: 7,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.colors.foregroundMuted,
    },
    tabActive: { backgroundColor: theme.colors.accent, borderColor: theme.colors.accent },
    tabText: { color: theme.colors.foregroundMuted, fontSize: 11, fontWeight: "800" },
    tabTextActive: { color: theme.colors.accentForeground },
    nativeBoard: { width: "100%", gap: 9 },
    pager: {
      width: "100%",
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 10,
    },
    pagerButton: {
      minHeight: 34,
      flex: 1,
      paddingHorizontal: 12,
      paddingVertical: 7,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 9,
      borderWidth: 1,
      borderColor: theme.colors.foregroundMuted,
    },
    pagerButtonText: { color: theme.colors.foreground, fontSize: 11, fontWeight: "800" },
    pagerPosition: {
      minWidth: 56,
      color: theme.colors.foregroundMuted,
      fontSize: 11,
      fontWeight: "800",
      textAlign: "center",
    },
    screenState: {
      flex: 1,
      minHeight: 260,
      alignItems: "center",
      justifyContent: "center",
      padding: 24,
      gap: 9,
      backgroundColor: theme.colors.surface0,
    },
    stateTitle: { color: theme.colors.foreground, fontSize: 18, fontWeight: "800", textAlign: "center" },
    stateText: { color: theme.colors.foregroundMuted, fontSize: 12, lineHeight: 18, textAlign: "center" },
    footnote: { color: theme.colors.foregroundMuted, fontSize: 10, lineHeight: 16, textAlign: "center" },
  });
}

type Styles = ReturnType<typeof createStyles>;

interface TintedSurfaceProps {
  children: ReactNode;
  opacity?: number;
  style?: StyleProp<ViewStyle>;
  styles: Styles;
  tone: string;
}

function TintedSurface({ children, opacity = 0.05, style, styles, tone }: TintedSurfaceProps) {
  return (
    <View style={[styles.tintedSurface, style]}>
      <View pointerEvents="none" style={[styles.tintLayer, { backgroundColor: tone, opacity }]} />
      {children}
    </View>
  );
}

function formatScanTime(value: string): string {
  return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : "알 수 없는 오류가 발생했습니다.";
}

function Tag({ accent, label, styles }: { accent?: boolean; label: string; styles: Styles }) {
  return (
    <View style={[styles.tag, accent ? styles.tagAccent : null]}>
      <Text style={[styles.tagText, accent ? styles.tagTextAccent : null]}>{label}</Text>
    </View>
  );
}

function IssueCard({ issue, onOpen, styles, theme }: {
  issue: GithubIssueCard;
  onOpen: (url: string) => void;
  styles: Styles;
  theme: PluginTheme;
}) {
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${issue.repository} 이슈 ${issue.number}, ${issue.title} GitHub에서 열기`}
      onPress={() => onOpen(issue.url)}
      style={({ pressed }) => [pressed ? styles.pressed : null]}
    >
      <TintedSurface tone={theme.colors.foregroundMuted} opacity={0.045} style={styles.card} styles={styles}>
        <View style={styles.cardIdentity}>
          <Text style={styles.repository} numberOfLines={1}>{issue.repository}</Text>
          <Text style={styles.issueNumber}>#{issue.number}</Text>
        </View>
        <Text style={styles.cardTitle}>{issue.title}</Text>
        {issue.labels.length > 0 || issue.priority || issue.size ? (
          <View style={styles.tagRow}>
            {issue.priority ? <Tag accent label={issue.priority} styles={styles} /> : null}
            {issue.size ? <Tag label={`Size ${issue.size}`} styles={styles} /> : null}
            {issue.labels.map((label) => <Tag key={label} label={label} styles={styles} />)}
          </View>
        ) : null}
        {issue.assignees.length > 0 ? (
          <Text style={styles.assigneeText}>{issue.assignees.map((name) => `@${name}`).join(" · ")}</Text>
        ) : null}
      </TintedSurface>
    </Pressable>
  );
}

function BoardColumn({ column, compact, issueCount, onOpen, styles, theme }: {
  column: GithubProjectColumn;
  compact: boolean;
  issueCount?: number;
  onOpen: (url: string) => void;
  styles: Styles;
  theme: PluginTheme;
}) {
  return (
    <TintedSurface
      tone={theme.colors.foregroundMuted}
      opacity={0.028}
      style={[styles.column, compact ? styles.compactColumn : null]}
      styles={styles}
    >
      <View style={styles.columnHeader}>
        <View style={styles.columnIdentity}>
          <View style={styles.columnMarker} />
          <Text style={styles.columnTitle} numberOfLines={1}>{column.name}</Text>
        </View>
        <Text style={styles.columnCount}>{issueCount ?? column.issues.length}</Text>
      </View>
      {column.issues.length > 0 ? (
        <View style={styles.cardList}>
          {column.issues.map((issue) => (
            <IssueCard key={issue.id} issue={issue} onOpen={onOpen} styles={styles} theme={theme} />
          ))}
        </View>
      ) : (
        <TintedSurface tone={theme.colors.foregroundMuted} opacity={0.028} style={styles.emptyColumn} styles={styles}>
          <Text style={styles.emptyColumnText}>이 상태에 표시할 이슈가 없습니다.</Text>
        </TintedSurface>
      )}
    </TintedSurface>
  );
}

function FullScreenState({ message, onRetry, retrying, styles, title }: {
  message: string;
  onRetry?: () => void;
  retrying?: boolean;
  styles: Styles;
  title: string;
}) {
  return (
    <View style={styles.screenState}>
      <Text style={styles.stateTitle}>{title}</Text>
      <Text style={styles.stateText}>{message}</Text>
      {onRetry ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="GitHub Board 다시 시도"
          disabled={retrying}
          onPress={onRetry}
          style={({ pressed }) => [
            styles.primaryButton,
            pressed ? styles.pressed : null,
            retrying ? styles.disabled : null,
          ]}
        >
          <Text style={styles.primaryButtonText}>{retrying ? "조회 중…" : "다시 시도"}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function MainSurface({ theme, layout, host }: PluginSurfaceProps) {
  const scan = useRpc(githubProjectBoardScan);
  const nativeCompatibilityLayout = isNativePluginPlatform(layout.platform);
  const [search, setSearch] = useState("");
  const [selectedColumnId, setSelectedColumnId] = useState<string | null>(null);
  const [nativeIssueIndex, setNativeIssueIndex] = useState(0);
  const [linkError, setLinkError] = useState<string | null>(null);
  const visualCompact = layout.compact || nativeCompatibilityLayout;
  const styles = useMemo(() => createStyles(theme, visualCompact), [theme, visualCompact]);
  const query = useQuery({
    queryKey: ["github-project-board", "scan", host.id],
    queryFn: () => scan({}),
    staleTime: Infinity,
    retry: false,
    refetchInterval: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const openUrl = useCallback(async (url: string) => {
    setLinkError(null);
    try {
      await Linking.openURL(url);
    } catch (error) {
      setLinkError(`링크를 열지 못했습니다: ${errorMessage(error)}`);
    }
  }, []);

  const filteredColumns = useMemo(
    () => filterProjectColumns(query.data?.columns ?? [], search),
    [query.data?.columns, search],
  );
  const visibleIssueCount = countColumnIssues(filteredColumns);
  const selectedColumn =
    filteredColumns.find((column) => column.id === selectedColumnId) ?? filteredColumns[0] ?? null;
  const nativeIssuePage = selectIssuePage(selectedColumn?.issues ?? [], nativeIssueIndex);

  const changeSearch = useCallback((value: string) => {
    setSearch(value);
    setNativeIssueIndex(0);
  }, []);

  const selectColumn = useCallback((columnId: string) => {
    setSelectedColumnId(columnId);
    setNativeIssueIndex(0);
  }, []);

  if (query.isPending && !query.data) {
    return (
      <FullScreenState
        message="GitHub Project의 상태와 이슈를 읽고 있습니다."
        styles={styles}
        title="보드를 구성하고 있습니다."
      />
    );
  }

  if (!query.data) {
    return (
      <FullScreenState
        message={errorMessage(query.error)}
        onRetry={() => void query.refetch()}
        retrying={query.isFetching}
        styles={styles}
        title="GitHub Board를 불러오지 못했습니다."
      />
    );
  }

  const result = query.data;
  const content = (
      <View style={[styles.shell, nativeCompatibilityLayout ? styles.nativeShell : null]}>
        <View style={[styles.header, nativeCompatibilityLayout ? styles.nativeHeader : null]}>
          <View style={styles.headerTop}>
            <View style={styles.headerCopy}>
              <Text style={styles.eyebrow}>GITHUB PROJECT #{result.project.number}</Text>
              <Text style={styles.title}>{result.project.title}</Text>
              {nativeCompatibilityLayout ? null : (
                <Text style={styles.subtitle}>이슈 흐름을 Paseo 안에서 읽기 전용 칸반으로 확인합니다.</Text>
              )}
            </View>
            <View style={styles.headerActions}>
              <Pressable
                accessibilityRole="link"
                accessibilityLabel="GitHub에서 Project 원본 열기"
                onPress={() => void openUrl(result.project.url)}
                style={({ pressed }) => [styles.secondaryButton, pressed ? styles.pressed : null]}
              >
                <Text style={styles.secondaryButtonText}>GitHub에서 열기 ↗</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="GitHub Board 새로고침"
                disabled={query.isFetching}
                onPress={() => void query.refetch()}
                style={({ pressed }) => [
                  styles.primaryButton,
                  pressed ? styles.pressed : null,
                  query.isFetching ? styles.disabled : null,
                ]}
              >
                <Text style={styles.primaryButtonText}>
                  {query.isFetching ? "조회 중…" : "새로고침 ↻"}
                </Text>
              </Pressable>
            </View>
          </View>
          <View style={styles.metadata}>
            <View style={styles.readOnlyPill}><Text style={styles.readOnlyText}>READ ONLY</Text></View>
            <Text style={styles.metaText}>{result.project.owner} · Project #{result.project.number}</Text>
            <View style={styles.dot} />
            <Text style={styles.metaText}>이슈 {result.issueCount}</Text>
            <View style={styles.dot} />
            <Text style={styles.metaText}>마지막 조회 {formatScanTime(result.scannedAt)}</Text>
          </View>
        </View>

        <View style={styles.divider} />

        <View style={styles.toolbar}>
          <View style={styles.searchBox}>
            <TextInput
              accessibilityLabel="GitHub Project 이슈 검색"
              autoCapitalize="none"
              autoCorrect={false}
              onChangeText={changeSearch}
              placeholder="제목, #번호, 저장소, 라벨, 담당자 검색"
              placeholderTextColor={theme.colors.foregroundMuted}
              style={styles.searchInput}
              value={search}
            />
          </View>
          <Text style={styles.resultText}>
            {search.trim()
              ? `검색 결과 ${visibleIssueCount} / ${result.issueCount}`
              : `${result.columns.length}개 상태 · ${result.issueCount}개 이슈`}
          </Text>
        </View>

        {query.error ? (
          <TintedSurface tone={theme.colors.statusDanger} opacity={0.045} style={styles.callout} styles={styles}>
            <View style={styles.calloutRail} />
            <Text style={styles.calloutTitle}>마지막 성공 결과를 표시하고 있습니다.</Text>
            <Text style={styles.calloutText}>새로고침 실패: {errorMessage(query.error)}</Text>
          </TintedSurface>
        ) : null}

        {linkError ? (
          <TintedSurface tone={theme.colors.statusDanger} opacity={0.045} style={styles.callout} styles={styles}>
            <View style={styles.calloutRail} />
            <Text style={styles.calloutTitle}>링크 열기 실패</Text>
            <Text style={styles.calloutText}>{linkError}</Text>
          </TintedSurface>
        ) : null}

        {result.warnings.length > 0 ? (
          <TintedSurface tone={theme.colors.statusDanger} opacity={0.035} style={styles.callout} styles={styles}>
            <View style={styles.calloutRail} />
            <Text style={styles.calloutTitle}>조회 경고 · {result.warnings.length}</Text>
            {result.warnings.map((warning, index) => (
              <Text key={`${index}:${warning}`} style={styles.calloutText}>• {warning}</Text>
            ))}
          </TintedSurface>
        ) : null}

        {filteredColumns.length === 0 ? (
          <TintedSurface tone={theme.colors.foregroundMuted} opacity={0.035} style={styles.callout} styles={styles}>
            <Text style={styles.stateTitle}>표시할 Status 칼럼이 없습니다.</Text>
            <Text style={styles.stateText}>GitHub Project의 Status 필드를 확인해 주세요.</Text>
          </TintedSurface>
        ) : nativeCompatibilityLayout ? (
          <View style={styles.nativeBoard}>
            <View style={styles.nativeTabList}>
              {filteredColumns.map((column) => {
                const active = selectedColumn?.id === column.id;
                return (
                  <Pressable
                    key={column.id}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: active }}
                    onPress={() => selectColumn(column.id)}
                    style={[styles.tab, active ? styles.tabActive : null]}
                  >
                    <Text style={[styles.tabText, active ? styles.tabTextActive : null]}>
                      {column.name} {column.issues.length}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            {selectedColumn ? (
              <>
                <BoardColumn
                  column={{
                    ...selectedColumn,
                    issues: nativeIssuePage.issue ? [nativeIssuePage.issue] : [],
                  }}
                  compact
                  issueCount={nativeIssuePage.total}
                  onOpen={(url) => void openUrl(url)}
                  styles={styles}
                  theme={theme}
                />
                {nativeIssuePage.total > 1 ? (
                  <View style={styles.pager}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="이전 GitHub 이슈"
                      disabled={nativeIssuePage.index === 0}
                      onPress={() => setNativeIssueIndex(nativeIssuePage.index - 1)}
                      style={({ pressed }) => [
                        styles.pagerButton,
                        pressed ? styles.pressed : null,
                        nativeIssuePage.index === 0 ? styles.disabled : null,
                      ]}
                    >
                      <Text style={styles.pagerButtonText}>← 이전</Text>
                    </Pressable>
                    <Text style={styles.pagerPosition}>
                      {nativeIssuePage.index + 1} / {nativeIssuePage.total}
                    </Text>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="다음 GitHub 이슈"
                      disabled={nativeIssuePage.index >= nativeIssuePage.total - 1}
                      onPress={() => setNativeIssueIndex(nativeIssuePage.index + 1)}
                      style={({ pressed }) => [
                        styles.pagerButton,
                        pressed ? styles.pressed : null,
                        nativeIssuePage.index >= nativeIssuePage.total - 1 ? styles.disabled : null,
                      ]}
                    >
                      <Text style={styles.pagerButtonText}>다음 →</Text>
                    </Pressable>
                  </View>
                ) : null}
              </>
            ) : null}
          </View>
        ) : layout.compact ? (
          <>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.tabs}
              contentContainerStyle={styles.tabList}
            >
              {filteredColumns.map((column) => {
                const active = selectedColumn?.id === column.id;
                return (
                  <Pressable
                    key={column.id}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: active }}
                    onPress={() => selectColumn(column.id)}
                    style={[styles.tab, active ? styles.tabActive : null]}
                  >
                    <Text style={[styles.tabText, active ? styles.tabTextActive : null]}>
                      {column.name} {column.issues.length}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            {selectedColumn ? (
              <BoardColumn
                column={selectedColumn}
                compact
                onOpen={(url) => void openUrl(url)}
                styles={styles}
                theme={theme}
              />
            ) : null}
          </>
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator
            style={styles.boardScroll}
            contentContainerStyle={styles.board}
          >
            {filteredColumns.map((column) => (
              <BoardColumn
                key={column.id}
                column={column}
                compact={false}
                onOpen={(url) => void openUrl(url)}
                styles={styles}
                theme={theme}
              />
            ))}
          </ScrollView>
        )}

        {nativeCompatibilityLayout ? null : (
          <Text style={styles.footnote}>
            GitHub CLI의 기존 인증을 사용합니다 · 제외된 비이슈 항목 {result.excludedItemCount}개 · GitHub 데이터는 변경하지 않습니다.
          </Text>
        )}
      </View>
  );

  // Paseo mobile versions affected by getpaseo/paseo#3930 route plugin
  // scrollables through BottomSheet internals without providing its context.
  if (nativeCompatibilityLayout) {
    return <View style={[styles.screen, styles.content, styles.nativeScreen]}>{content}</View>;
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      {content}
    </ScrollView>
  );
}
