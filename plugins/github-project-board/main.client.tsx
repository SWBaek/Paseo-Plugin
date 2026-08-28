import { Icon, type PluginSurfaceProps, type PluginTheme, useRpc } from "@getpaseo/plugin";
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
} from "react-native";
import {
  githubProjectBoardList,
  githubProjectBoardScan,
  type GithubIssueCard,
  type GithubProjectColumn,
} from "./github-project-board.shared";
import { countColumnIssues, filterProjectColumns } from "./github-project-board.view";

function createStyles(theme: PluginTheme, compact: boolean) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.colors.surface0 },
    content: {
      width: "100%",
      padding: compact ? 16 : 24,
      paddingBottom: compact ? 32 : 48,
    },
    shell: { width: "100%", maxWidth: 1640, alignSelf: "center", gap: 24 },
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
    primaryButton: {
      minHeight: 44,
      minWidth: compact ? 0 : 120,
      flex: compact ? 1 : 0,
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderRadius: 8,
      backgroundColor: theme.colors.accent,
      flexDirection: "row",
      gap: 8,
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
    projectSelectorSection: { gap: 8 },
    projectSelectorLabel: {
      color: theme.colors.foregroundMuted,
      fontSize: 10,
      lineHeight: 15,
      fontWeight: "500",
    },
    projectSelectorScroll: { width: "100%" },
    projectSelectorList: { flexDirection: "row", gap: 8, paddingRight: 4 },
    projectSelector: {
      minHeight: 44,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface2,
    },
    projectSelectorActive: { borderColor: theme.colors.accent },
    projectSelectorText: {
      color: theme.colors.foregroundMuted,
      fontSize: 12,
      lineHeight: 18,
      fontWeight: "500",
    },
    projectSelectorTextActive: { color: theme.colors.foreground },
    projectSelectorCount: {
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
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface2,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      justifyContent: "center",
      paddingHorizontal: 12,
    },
    searchInput: {
      color: theme.colors.foreground,
      fontSize: 14,
      lineHeight: 20,
      fontWeight: "400",
      padding: 0,
      flex: 1,
    },
    resultText: { color: theme.colors.foregroundMuted, fontSize: 10, lineHeight: 16, fontWeight: "400" },
    notice: {
      borderRadius: 8,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface1,
      padding: 16,
      gap: 8,
    },
    noticeWarning: { borderColor: theme.colors.statusWarning },
    noticeError: { borderColor: theme.colors.statusDanger },
    noticeHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
    noticeTitle: {
      flex: 1,
      minWidth: 0,
      color: theme.colors.foreground,
      fontSize: 12,
      lineHeight: 18,
      fontWeight: "600",
    },
    noticeWarningTitle: { color: theme.colors.statusWarning },
    noticeErrorTitle: { color: theme.colors.statusDanger },
    noticeText: { color: theme.colors.foregroundMuted, fontSize: 12, lineHeight: 18, fontWeight: "400" },
    boardScroll: { width: "100%" },
    board: { flexDirection: "row", alignItems: "flex-start", gap: 16, paddingBottom: 8 },
    column: {
      width: 320,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface1,
      overflow: "hidden",
    },
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
    divider: { height: 1, backgroundColor: theme.colors.border },
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
      borderWidth: 1,
      borderBottomWidth: 2,
      borderColor: theme.colors.border,
      borderBottomColor: theme.colors.border,
      borderRadius: 8,
      backgroundColor: theme.colors.surface2,
    },
    tabActive: { borderColor: theme.colors.accent, borderBottomColor: theme.colors.accent },
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
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface1,
    },
    stateIcon: { marginBottom: 4 },
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

interface NoticeProps {
  children: ReactNode;
  styles: Styles;
  theme: PluginTheme;
  title: string;
  tone: "warning" | "error";
}

function Notice({ children, styles, theme, title, tone }: NoticeProps) {
  const error = tone === "error";
  return (
    <View style={[styles.notice, error ? styles.noticeError : styles.noticeWarning]}>
      <View style={styles.noticeHeader}>
        <Icon
          name={error ? "CircleAlert" : "TriangleAlert"}
          size={16}
          color={error ? theme.colors.statusDanger : theme.colors.statusWarning}
        />
        <Text style={[
          styles.noticeTitle,
          error ? styles.noticeErrorTitle : styles.noticeWarningTitle,
        ]}>
          {title}
        </Text>
      </View>
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

function BoardColumn({ column, compact, onOpen, styles }: {
  column: GithubProjectColumn;
  compact: boolean;
  onOpen: (url: string) => void;
  styles: Styles;
}) {
  return (
    <View style={[styles.column, compact ? styles.compactColumn : null]}>
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
    </View>
  );
}

function FullScreenState({ kind = "loading", message, onRetry, retrying, styles, theme, title }: {
  kind?: "loading" | "empty" | "error";
  message: string;
  onRetry?: () => void;
  retrying?: boolean;
  styles: Styles;
  theme: PluginTheme;
  title: string;
}) {
  const iconName = kind === "error" ? "CircleAlert" : kind === "empty" ? "Inbox" : "RefreshCw";
  const iconColor = kind === "error" ? theme.colors.statusDanger : theme.colors.foregroundMuted;
  return (
    <View style={styles.stateScreen}>
      <View style={styles.statePanel}>
        <View style={styles.stateIcon}>
          <Icon name={iconName} size={24} color={iconColor} />
        </View>
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
            <Icon name="RefreshCw" size={16} color={theme.colors.accentForeground} />
            <Text style={styles.primaryButtonText}>{retrying ? "조회 중…" : "다시 시도"}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

export function MainSurface({ theme, layout, host }: PluginSurfaceProps) {
  const listProjects = useRpc(githubProjectBoardList);
  const scan = useRpc(githubProjectBoardScan);
  const [search, setSearch] = useState("");
  const [selectedProjectNumber, setSelectedProjectNumber] = useState<number | null>(null);
  const [selectedColumnId, setSelectedColumnId] = useState<string | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);
  const styles = useMemo(() => createStyles(theme, layout.compact), [theme, layout.compact]);
  const projectListQuery = useQuery({
    queryKey: ["github-project-board", "list", host.id],
    queryFn: () => listProjects({}),
    staleTime: Infinity,
    retry: false,
    refetchInterval: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const projects = projectListQuery.data?.projects ?? [];
  const selectedProject =
    projects.find((project) => project.number === selectedProjectNumber) ?? projects[0] ?? null;
  const query = useQuery({
    queryKey: ["github-project-board", "scan", host.id, selectedProject?.number],
    queryFn: () => {
      if (!selectedProject) {
        throw new Error("조회할 GitHub Project가 없습니다.");
      }
      return scan({ number: selectedProject.number });
    },
    enabled: selectedProject !== null,
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

  if (projectListQuery.isPending && !projectListQuery.data) {
    return (
      <FullScreenState
        message="선택할 수 있는 개인 GitHub Project를 읽고 있습니다."
        styles={styles}
        theme={theme}
        title="Project 목록을 불러오는 중"
      />
    );
  }

  if (!projectListQuery.data) {
    return (
      <FullScreenState
        kind="error"
        message={errorMessage(projectListQuery.error)}
        onRetry={() => void projectListQuery.refetch()}
        retrying={projectListQuery.isFetching}
        styles={styles}
        theme={theme}
        title="GitHub Project 목록을 불러오지 못했습니다"
      />
    );
  }

  if (!selectedProject) {
    return (
      <FullScreenState
        kind="empty"
        message="GitHub에서 개인 Project를 만든 뒤 다시 시도하세요."
        onRetry={() => void projectListQuery.refetch()}
        retrying={projectListQuery.isFetching}
        styles={styles}
        theme={theme}
        title="표시할 GitHub Project가 없습니다"
      />
    );
  }

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
        kind="error"
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
  const refreshing = projectListQuery.isFetching || query.isFetching;

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
                <Icon name="ExternalLink" size={16} color={theme.colors.foreground} />
                <Text style={styles.secondaryButtonText}>GitHub에서 열기</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="GitHub Project 새로고침"
                accessibilityState={{ disabled: refreshing }}
                disabled={refreshing}
                onPress={() => {
                  void projectListQuery.refetch();
                  void query.refetch();
                }}
                style={({ pressed }) => [
                  styles.primaryButton,
                  pressed ? styles.pressed : null,
                  refreshing ? styles.disabled : null,
                ]}
              >
                <Icon name="RefreshCw" size={16} color={theme.colors.accentForeground} />
                <Text style={styles.primaryButtonText}>{refreshing ? "조회 중…" : "새로고침"}</Text>
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

        <View style={styles.projectSelectorSection}>
          <Text style={styles.projectSelectorLabel}>GitHub Project 선택</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.projectSelectorScroll}
            contentContainerStyle={styles.projectSelectorList}
          >
            {projects.map((project) => {
              const selected = project.number === selectedProject.number;
              return (
                <Pressable
                  key={project.number}
                  accessibilityRole="tab"
                  accessibilityLabel={`${project.title}, GitHub Project #${project.number}, 항목 ${project.itemCount}개`}
                  accessibilityState={{ selected }}
                  onPress={() => {
                    setSelectedProjectNumber(project.number);
                    setSelectedColumnId(null);
                    setSearch("");
                    setLinkError(null);
                  }}
                  style={({ pressed }) => [
                    styles.projectSelector,
                    selected ? styles.projectSelectorActive : null,
                    pressed ? styles.pressed : null,
                  ]}
                >
                  <Text style={[
                    styles.projectSelectorText,
                    selected ? styles.projectSelectorTextActive : null,
                  ]}>
                    {project.title}
                  </Text>
                  <Text style={styles.projectSelectorCount}>{project.itemCount}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        <View style={styles.toolbar}>
          <View style={styles.searchBox}>
            <Icon name="Search" size={16} color={theme.colors.foregroundMuted} />
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
              ? `검색 결과 ${visibleIssueCount} / ${result.issueCount}`
              : `${result.columns.length}개 상태 · ${result.issueCount}개 이슈`}
          </Text>
        </View>

        {query.error ? (
          <Notice
            styles={styles}
            theme={theme}
            title="마지막 성공 결과를 표시하고 있습니다"
            tone="error"
          >
            <Text style={styles.noticeText}>새로고침 실패: {errorMessage(query.error)}</Text>
          </Notice>
        ) : null}

        {projectListQuery.error ? (
          <Notice styles={styles} theme={theme} title="Project 목록을 갱신하지 못했습니다" tone="error">
            <Text style={styles.noticeText}>마지막 성공 목록을 표시하고 있습니다: {errorMessage(projectListQuery.error)}</Text>
          </Notice>
        ) : null}

        {linkError ? (
          <Notice styles={styles} theme={theme} title="링크를 열지 못했습니다" tone="error">
            <Text style={styles.noticeText}>{linkError}</Text>
          </Notice>
        ) : null}

        {result.warnings.length > 0 ? (
          <Notice
            styles={styles}
            theme={theme}
            title={`일부 항목을 완전히 조회하지 못했습니다 · ${result.warnings.length}`}
            tone="warning"
          >
            {result.warnings.map((warning, index) => (
              <Text key={`${index}:${warning}`} style={styles.noticeText}>• {warning}</Text>
            ))}
          </Notice>
        ) : null}

        {result.columns.length === 0 ? (
          <View style={styles.statePanel}>
            <View style={styles.stateIcon}>
              <Icon name="Columns3" size={24} color={theme.colors.foregroundMuted} />
            </View>
            <Text style={styles.stateTitle}>표시할 Status 칼럼이 없습니다</Text>
            <Text style={styles.stateText}>GitHub Project의 Status 필드를 확인하세요.</Text>
          </View>
        ) : result.issueCount === 0 ? (
          <View style={styles.statePanel}>
            <View style={styles.stateIcon}>
              <Icon name="Inbox" size={24} color={theme.colors.foregroundMuted} />
            </View>
            <Text style={styles.stateTitle}>Project에 표시할 이슈가 없습니다</Text>
            <Text style={styles.stateText}>이 저장소의 이슈를 GitHub Project에 추가하세요.</Text>
          </View>
        ) : hasSearch && visibleIssueCount === 0 ? (
          <View style={styles.statePanel}>
            <View style={styles.stateIcon}>
              <Icon name="Search" size={24} color={theme.colors.foregroundMuted} />
            </View>
            <Text style={styles.stateTitle}>검색 결과가 없습니다</Text>
            <Text style={styles.stateText}>검색어를 줄이거나 다른 단어로 찾아보세요.</Text>
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
