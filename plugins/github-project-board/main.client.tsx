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
  IMPORTANT_REPOSITORIES,
} from "./github-project-board.view";

function createStyles(theme: PluginTheme, compact: boolean) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.colors.surface0 },
    content: {
      width: "100%",
      padding: compact ? 16 : 24,
      paddingBottom: compact ? 32 : 48,
    },
    shell: { width: "100%", maxWidth: 1640, alignSelf: "center", gap: 24 },
    tintedSurface: { position: "relative", overflow: "hidden" },
    tintLayer: { ...StyleSheet.absoluteFillObject },
    projectHeader: { gap: 12 },
    headerTop: {
      flexDirection: compact ? "column" : "row",
      alignItems: compact ? "stretch" : "flex-start",
      justifyContent: "space-between",
      gap: 16,
    },
    headerCopy: { flex: 1, minWidth: 0, gap: 4 },
    contextLabel: {
      color: theme.colors.foregroundMuted,
      fontSize: 10,
      lineHeight: 15,
      fontWeight: "500",
    },
    contentTitle: {
      color: theme.colors.foreground,
      fontSize: compact ? 20 : 24,
      lineHeight: compact ? 26 : 30,
      fontWeight: "500",
    },
    description: {
      color: theme.colors.foregroundMuted,
      fontSize: 12,
      lineHeight: 18,
      fontWeight: "400",
    },
    actions: { flexDirection: "row", alignItems: "center", gap: 8 },
    secondaryButton: {
      minHeight: 44,
      minWidth: compact ? 0 : 144,
      flex: compact ? 1 : 0,
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: theme.colors.foregroundMuted,
      alignItems: "center",
      justifyContent: "center",
    },
    secondaryButtonText: {
      color: theme.colors.foreground,
      fontSize: 12,
      fontWeight: "500",
      textAlign: "center",
    },
    primaryButton: {
      minHeight: 44,
      minWidth: compact ? 0 : 120,
      flex: compact ? 1 : 0,
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderRadius: 8,
      backgroundColor: theme.colors.accent,
      alignItems: "center",
      justifyContent: "center",
    },
    primaryButtonText: {
      color: theme.colors.accentForeground,
      fontSize: 12,
      fontWeight: "500",
      textAlign: "center",
    },
    pressed: { opacity: 0.76 },
    disabled: { opacity: 0.5 },
    metadata: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8 },
    metaText: { color: theme.colors.foregroundMuted, fontSize: 10, lineHeight: 16, fontWeight: "400" },
    dotSeparator: {
      width: 3,
      height: 3,
      borderRadius: 2,
      backgroundColor: theme.colors.foregroundMuted,
    },
    repositoryFilterSection: { gap: 8 },
    repositoryFilterLabel: {
      color: theme.colors.foregroundMuted,
      fontSize: 10,
      lineHeight: 15,
      fontWeight: "500",
    },
    repositoryFilterScroll: { width: "100%" },
    repositoryFilterList: { flexDirection: "row", gap: 8, paddingRight: 4 },
    repositoryFilter: {
      minHeight: 44,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: theme.colors.foregroundMuted,
    },
    repositoryFilterActive: { borderColor: theme.colors.accent },
    repositoryFilterText: {
      color: theme.colors.foregroundMuted,
      fontSize: 12,
      lineHeight: 18,
      fontWeight: "500",
    },
    repositoryFilterTextActive: { color: theme.colors.foreground },
    repositoryFilterCount: {
      color: theme.colors.foregroundMuted,
      fontSize: 10,
      lineHeight: 15,
      fontWeight: "400",
    },
    toolbar: {
      flexDirection: compact ? "column" : "row",
      alignItems: compact ? "stretch" : "center",
      justifyContent: "space-between",
      gap: 12,
    },
    searchBox: {
      flex: compact ? 0 : 1,
      maxWidth: compact ? undefined : 560,
      minHeight: 44,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: theme.colors.foregroundMuted,
      justifyContent: "center",
      paddingHorizontal: 12,
    },
    searchInput: {
      color: theme.colors.foreground,
      fontSize: 14,
      lineHeight: 20,
      fontWeight: "400",
      padding: 0,
    },
    resultText: { color: theme.colors.foregroundMuted, fontSize: 10, lineHeight: 16, fontWeight: "400" },
    notice: { borderRadius: 8, padding: 16, gap: 4 },
    noticeTitle: { color: theme.colors.foreground, fontSize: 12, lineHeight: 18, fontWeight: "600" },
    noticeErrorTitle: { color: theme.colors.statusDanger },
    noticeText: { color: theme.colors.foregroundMuted, fontSize: 12, lineHeight: 18, fontWeight: "400" },
    boardScroll: { width: "100%" },
    board: { flexDirection: "row", alignItems: "flex-start", gap: 16, paddingBottom: 8 },
    column: { width: 320, borderRadius: 10 },
    compactColumn: { width: "100%" },
    columnHeader: {
      minHeight: 52,
      paddingHorizontal: 16,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
    },
    columnTitle: {
      flex: 1,
      color: theme.colors.foreground,
      fontSize: 14,
      lineHeight: 20,
      fontWeight: "600",
    },
    columnCount: {
      color: theme.colors.foregroundMuted,
      fontSize: 10,
      lineHeight: 15,
      fontWeight: "500",
      textAlign: "right",
    },
    divider: { height: 1, backgroundColor: theme.colors.foregroundMuted, opacity: 0.18 },
    card: { minHeight: 56, paddingHorizontal: 16, paddingVertical: 12, gap: 6 },
    cardIdentity: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6 },
    repository: { color: theme.colors.foregroundMuted, fontSize: 10, lineHeight: 15, fontWeight: "500" },
    issueNumber: { color: theme.colors.foregroundMuted, fontSize: 10, lineHeight: 15, fontWeight: "400" },
    cardTitle: { color: theme.colors.foreground, fontSize: 14, lineHeight: 20, fontWeight: "400" },
    cardMeta: { color: theme.colors.foregroundMuted, fontSize: 10, lineHeight: 15, fontWeight: "400" },
    emptyColumn: {
      minHeight: 112,
      padding: 16,
      alignItems: "center",
      justifyContent: "center",
    },
    emptyColumnText: {
      color: theme.colors.foregroundMuted,
      fontSize: 12,
      lineHeight: 18,
      fontWeight: "400",
      textAlign: "center",
    },
    tabs: { width: "100%" },
    tabList: { flexDirection: "row", gap: 8 },
    tab: {
      minHeight: 44,
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderBottomWidth: 2,
      borderBottomColor: theme.colors.foregroundMuted,
    },
    tabActive: { borderBottomColor: theme.colors.accent },
    tabText: { color: theme.colors.foregroundMuted, fontSize: 12, lineHeight: 18, fontWeight: "500" },
    tabTextActive: { color: theme.colors.foreground },
    stateScreen: {
      flex: 1,
      padding: compact ? 16 : 24,
      backgroundColor: theme.colors.surface0,
    },
    statePanel: {
      width: "100%",
      maxWidth: 720,
      minHeight: 220,
      alignSelf: "center",
      padding: 24,
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      borderRadius: 10,
    },
    stateTitle: {
      color: theme.colors.foreground,
      fontSize: 14,
      lineHeight: 20,
      fontWeight: "600",
      textAlign: "center",
    },
    stateText: {
      color: theme.colors.foregroundMuted,
      fontSize: 12,
      lineHeight: 18,
      fontWeight: "400",
      textAlign: "center",
      maxWidth: 520,
    },
    footnote: {
      color: theme.colors.foregroundMuted,
      fontSize: 10,
      lineHeight: 16,
      fontWeight: "400",
      textAlign: "center",
    },
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

function issueMetadata(issue: GithubIssueCard): string | null {
  const values = [
    issue.priority ? `Priority ${issue.priority}` : null,
    issue.size ? `Size ${issue.size}` : null,
    ...issue.labels,
  ].filter((value): value is string => Boolean(value));
  return values.length > 0 ? values.join(" · ") : null;
}

function IssueCard({ issue, onOpen, styles }: {
  issue: GithubIssueCard;
  onOpen: (url: string) => void;
  styles: Styles;
}) {
  const metadata = issueMetadata(issue);
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${issue.repository} 이슈 ${issue.number}, ${issue.title} GitHub에서 열기`}
      onPress={() => onOpen(issue.url)}
      style={({ pressed }) => [styles.card, pressed ? styles.pressed : null]}
    >
      <View style={styles.cardIdentity}>
        <Text style={styles.repository} numberOfLines={1}>{issue.repository}</Text>
        <Text style={styles.issueNumber}>#{issue.number}</Text>
      </View>
      <Text style={styles.cardTitle}>{issue.title}</Text>
      {metadata ? <Text style={styles.cardMeta}>{metadata}</Text> : null}
      {issue.assignees.length > 0 ? (
        <Text style={styles.cardMeta}>{issue.assignees.map((name) => `@${name}`).join(" · ")}</Text>
      ) : null}
    </Pressable>
  );
}

function BoardColumn({ column, compact, onOpen, styles, theme }: {
  column: GithubProjectColumn;
  compact: boolean;
  onOpen: (url: string) => void;
  styles: Styles;
  theme: PluginTheme;
}) {
  return (
    <TintedSurface
      tone={theme.colors.foregroundMuted}
      opacity={0.035}
      style={[styles.column, compact ? styles.compactColumn : null]}
      styles={styles}
    >
      <View style={styles.columnHeader}>
        <Text style={styles.columnTitle} numberOfLines={1}>{column.name}</Text>
        <Text style={styles.columnCount}>{column.issues.length}개</Text>
      </View>
      <View style={styles.divider} />
      {column.issues.length > 0 ? (
        column.issues.map((issue, index) => (
          <React.Fragment key={issue.id}>
            {index > 0 ? <View style={styles.divider} /> : null}
            <IssueCard issue={issue} onOpen={onOpen} styles={styles} />
          </React.Fragment>
        ))
      ) : (
        <View style={styles.emptyColumn}>
          <Text style={styles.emptyColumnText}>이 상태에 표시할 이슈가 없습니다.</Text>
        </View>
      )}
    </TintedSurface>
  );
}

function FullScreenState({ message, onRetry, retrying, styles, theme, title }: {
  message: string;
  onRetry?: () => void;
  retrying?: boolean;
  styles: Styles;
  theme: PluginTheme;
  title: string;
}) {
  return (
    <View style={styles.stateScreen}>
      <TintedSurface
        tone={onRetry ? theme.colors.statusDanger : theme.colors.foregroundMuted}
        opacity={onRetry ? 0.05 : 0.04}
        style={styles.statePanel}
        styles={styles}
      >
        <Text style={styles.stateTitle}>{title}</Text>
        <Text style={styles.stateText}>{message}</Text>
        {onRetry ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="GitHub Board 다시 시도"
            accessibilityState={{ disabled: retrying }}
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
      </TintedSurface>
    </View>
  );
}

export function MainSurface({ theme, layout, host }: PluginSurfaceProps) {
  const scan = useRpc(githubProjectBoardScan);
  const [search, setSearch] = useState("");
  const [selectedRepository, setSelectedRepository] = useState<string | null>(null);
  const [selectedColumnId, setSelectedColumnId] = useState<string | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);
  const styles = useMemo(() => createStyles(theme, layout.compact), [theme, layout.compact]);
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
    () => filterProjectColumns(query.data?.columns ?? [], search, selectedRepository),
    [query.data?.columns, search, selectedRepository],
  );
  const repositoryIssueCounts = useMemo(
    () => new Map<string, number>(
      IMPORTANT_REPOSITORIES.map((repository) => [
        repository,
        countColumnIssues(filterProjectColumns(query.data?.columns ?? [], "", repository)),
      ] as const),
    ),
    [query.data?.columns],
  );
  const visibleIssueCount = countColumnIssues(filteredColumns);
  const selectedColumn =
    filteredColumns.find((column) => column.id === selectedColumnId) ?? filteredColumns[0] ?? null;

  if (query.isPending && !query.data) {
    return (
      <FullScreenState
        message="GitHub Project의 Status와 이슈를 읽고 있습니다."
        styles={styles}
        theme={theme}
        title="Project 보드를 불러오는 중"
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
        theme={theme}
        title="GitHub Project를 불러오지 못했습니다"
      />
    );
  }

  const result = query.data;
  const hasSearch = search.trim().length > 0;
  const hasRepositoryFilter = selectedRepository !== null;
  const selectedRepositoryIssueCount = selectedRepository
    ? repositoryIssueCounts.get(selectedRepository) ?? 0
    : result.issueCount;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.shell}>
        <View style={styles.projectHeader}>
          <View style={styles.headerTop}>
            <View style={styles.headerCopy}>
              <Text style={styles.contextLabel}>{result.project.owner} · Project #{result.project.number}</Text>
              <Text style={styles.contentTitle}>{result.project.title}</Text>
              <Text style={styles.description}>GitHub Project의 이슈 흐름을 읽기 전용으로 보여줍니다.</Text>
            </View>
            <View style={styles.actions}>
              <Pressable
                accessibilityRole="link"
                accessibilityLabel="GitHub에서 Project 원본 열기"
                onPress={() => void openUrl(result.project.url)}
                style={({ pressed }) => [styles.secondaryButton, pressed ? styles.pressed : null]}
              >
                <Text style={styles.secondaryButtonText}>GitHub에서 열기</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="GitHub Project 새로고침"
                accessibilityState={{ disabled: query.isFetching }}
                disabled={query.isFetching}
                onPress={() => void query.refetch()}
                style={({ pressed }) => [
                  styles.primaryButton,
                  pressed ? styles.pressed : null,
                  query.isFetching ? styles.disabled : null,
                ]}
              >
                <Text style={styles.primaryButtonText}>{query.isFetching ? "조회 중…" : "새로고침"}</Text>
              </Pressable>
            </View>
          </View>
          <View style={styles.metadata}>
            <Text style={styles.metaText}>읽기 전용</Text>
            <View style={styles.dotSeparator} />
            <Text style={styles.metaText}>이슈 {result.issueCount}개</Text>
            <View style={styles.dotSeparator} />
            <Text style={styles.metaText}>마지막 조회 {formatScanTime(result.scannedAt)}</Text>
          </View>
        </View>

        <View style={styles.repositoryFilterSection}>
          <Text style={styles.repositoryFilterLabel}>중요 저장소</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.repositoryFilterScroll}
            contentContainerStyle={styles.repositoryFilterList}
          >
            {[
              { label: "전체", value: null, count: result.issueCount },
              ...IMPORTANT_REPOSITORIES.map((repository) => ({
                label: repository,
                value: repository as string | null,
                count: repositoryIssueCounts.get(repository) ?? 0,
              })),
            ].map((repository) => {
              const selected = repository.value === selectedRepository;
              return (
                <Pressable
                  key={repository.value ?? "all"}
                  accessibilityRole="button"
                  accessibilityLabel={`${repository.label} 저장소 필터, 이슈 ${repository.count}개`}
                  accessibilityState={{ selected }}
                  onPress={() => setSelectedRepository(repository.value)}
                  style={({ pressed }) => [
                    styles.repositoryFilter,
                    selected ? styles.repositoryFilterActive : null,
                    pressed ? styles.pressed : null,
                  ]}
                >
                  <Text style={[
                    styles.repositoryFilterText,
                    selected ? styles.repositoryFilterTextActive : null,
                  ]}>
                    {repository.label}
                  </Text>
                  <Text style={styles.repositoryFilterCount}>{repository.count}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        <View style={styles.toolbar}>
          <View style={styles.searchBox}>
            <TextInput
              accessibilityLabel="GitHub Project 이슈 검색"
              autoCapitalize="none"
              autoCorrect={false}
              onChangeText={setSearch}
              placeholder="제목, #번호, 저장소, 라벨, 담당자 검색"
              placeholderTextColor={theme.colors.foregroundMuted}
              style={styles.searchInput}
              value={search}
            />
          </View>
          <Text accessibilityLiveRegion="polite" style={styles.resultText}>
            {hasSearch
              ? `검색 결과 ${visibleIssueCount} / ${selectedRepositoryIssueCount}`
              : hasRepositoryFilter
                ? `${selectedRepository} · 이슈 ${visibleIssueCount}개`
              : `${result.columns.length}개 상태 · ${result.issueCount}개 이슈`}
          </Text>
        </View>

        {query.error ? (
          <TintedSurface tone={theme.colors.statusDanger} opacity={0.05} style={styles.notice} styles={styles}>
            <Text style={[styles.noticeTitle, styles.noticeErrorTitle]}>마지막 성공 결과를 표시하고 있습니다</Text>
            <Text style={styles.noticeText}>새로고침 실패: {errorMessage(query.error)}</Text>
          </TintedSurface>
        ) : null}

        {linkError ? (
          <TintedSurface tone={theme.colors.statusDanger} opacity={0.05} style={styles.notice} styles={styles}>
            <Text style={[styles.noticeTitle, styles.noticeErrorTitle]}>링크를 열지 못했습니다</Text>
            <Text style={styles.noticeText}>{linkError}</Text>
          </TintedSurface>
        ) : null}

        {result.warnings.length > 0 ? (
          <TintedSurface tone={theme.colors.foregroundMuted} opacity={0.04} style={styles.notice} styles={styles}>
            <Text style={styles.noticeTitle}>일부 항목을 완전히 조회하지 못했습니다 · {result.warnings.length}</Text>
            {result.warnings.map((warning, index) => (
              <Text key={`${index}:${warning}`} style={styles.noticeText}>• {warning}</Text>
            ))}
          </TintedSurface>
        ) : null}

        {result.columns.length === 0 ? (
          <TintedSurface tone={theme.colors.foregroundMuted} opacity={0.04} style={styles.statePanel} styles={styles}>
            <Text style={styles.stateTitle}>표시할 Status 칼럼이 없습니다</Text>
            <Text style={styles.stateText}>GitHub Project의 Status 필드를 확인하세요.</Text>
          </TintedSurface>
        ) : (hasSearch || hasRepositoryFilter) && visibleIssueCount === 0 ? (
          <TintedSurface tone={theme.colors.foregroundMuted} opacity={0.04} style={styles.statePanel} styles={styles}>
            <Text style={styles.stateTitle}>
              {hasSearch ? "검색 결과가 없습니다" : `${selectedRepository}에 표시할 이슈가 없습니다`}
            </Text>
            <Text style={styles.stateText}>
              {hasSearch
                ? "검색어를 줄이거나 다른 단어로 찾아보세요."
                : "GitHub Project에 이 저장소의 이슈를 추가했는지 확인하세요."}
            </Text>
          </TintedSurface>
        ) : layout.compact ? (
          <>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.tabs}
              contentContainerStyle={styles.tabList}
            >
              {filteredColumns.map((column) => {
                const selected = selectedColumn?.id === column.id;
                return (
                  <Pressable
                    key={column.id}
                    accessibilityRole="tab"
                    accessibilityLabel={`${column.name} 상태, 이슈 ${column.issues.length}개`}
                    accessibilityState={{ selected }}
                    onPress={() => setSelectedColumnId(column.id)}
                    style={({ pressed }) => [
                      styles.tab,
                      selected ? styles.tabActive : null,
                      pressed ? styles.pressed : null,
                    ]}
                  >
                    <Text style={[styles.tabText, selected ? styles.tabTextActive : null]}>
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

        <Text style={styles.footnote}>
          GitHub CLI의 기존 인증을 사용합니다 · 제외된 비이슈 항목 {result.excludedItemCount}개 · GitHub 데이터는 변경하지 않습니다.
        </Text>
      </View>
    </ScrollView>
  );
}
