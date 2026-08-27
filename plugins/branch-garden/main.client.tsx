import type { PluginSurfaceProps, PluginTheme } from "@getpaseo/plugin";
import { useRpc } from "@getpaseo/plugin";
import { useQuery } from "@tanstack/react-query";
import React, { type ReactNode, useMemo, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import {
  branchGardenScan,
  type BranchCategory,
  type BranchReason,
  type BranchSnapshot,
  type RepositorySnapshot,
  type WorkspaceSnapshot,
} from "./branch-garden.shared";
import { filterRepositories, type RepositoryFilter } from "./branch-garden.view";

const CATEGORY_LABELS: Record<BranchCategory, string> = {
  cleanup_candidate: "정리 후보",
  review: "검토 필요",
  keep: "유지",
};

const REASON_LABELS: Record<BranchReason, string> = {
  default_branch: "기본 브랜치",
  checked_out: "worktree에서 사용 중",
  insufficient_data: "판단 정보 부족",
  unmerged_tracked: "미병합 · upstream 정상",
  unmerged_orphaned: "미병합 · upstream 없음",
  merged_tracked: "병합 완료 · upstream 정상",
  merged_orphaned: "병합 완료 · upstream 없음",
};

const FILTERS: ReadonlyArray<{ id: RepositoryFilter; label: string }> = [
  { id: "all", label: "전체" },
  { id: "cleanup_candidate", label: "정리 후보" },
  { id: "review", label: "검토 필요" },
];

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
      maxWidth: 1180,
      alignSelf: "center",
      gap: 24,
    },
    tintedSurface: { position: "relative", overflow: "hidden" },
    tintLayer: { ...StyleSheet.absoluteFillObject },
    overview: {
      flexDirection: compact ? "column" : "row",
      alignItems: compact ? "stretch" : "center",
      justifyContent: "space-between",
      gap: 16,
    },
    overviewCopy: { flex: 1, minWidth: 0, gap: 8 },
    description: {
      color: theme.colors.foreground,
      fontSize: 14,
      lineHeight: 21,
      fontWeight: "400",
    },
    metadata: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8 },
    metaText: { color: theme.colors.foregroundMuted, fontSize: 10, lineHeight: 16, fontWeight: "400" },
    dotSeparator: {
      width: 3,
      height: 3,
      borderRadius: 2,
      backgroundColor: theme.colors.foregroundMuted,
    },
    primaryButton: {
      minHeight: 44,
      minWidth: compact ? undefined : 120,
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderRadius: 8,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.colors.accent,
    },
    primaryButtonText: {
      color: theme.colors.accentForeground,
      fontSize: 12,
      fontWeight: "500",
      textAlign: "center",
    },
    pressed: { opacity: 0.76 },
    disabled: { opacity: 0.5 },
    section: { gap: 12 },
    sectionHeader: {
      flexDirection: compact ? "column" : "row",
      alignItems: compact ? "stretch" : "flex-end",
      justifyContent: "space-between",
      gap: 12,
    },
    sectionCopy: { flex: 1, minWidth: 0, gap: 4 },
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
    summary: {
      flexDirection: "row",
      flexWrap: "wrap",
      borderRadius: 10,
      padding: 8,
      gap: 4,
    },
    summaryItem: {
      flexGrow: 1,
      flexBasis: compact ? "46%" : 0,
      minWidth: compact ? 128 : 0,
      paddingHorizontal: 12,
      paddingVertical: 8,
      gap: 4,
    },
    summaryValue: {
      color: theme.colors.foreground,
      fontSize: compact ? 20 : 24,
      lineHeight: compact ? 26 : 30,
      fontWeight: "500",
    },
    summaryLabel: {
      color: theme.colors.foregroundMuted,
      fontSize: 10,
      lineHeight: 15,
      fontWeight: "400",
    },
    filters: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    filterButton: {
      minHeight: 44,
      minWidth: compact ? 0 : 96,
      flex: compact ? 1 : 0,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: theme.colors.foregroundMuted,
      alignItems: "center",
      justifyContent: "center",
    },
    filterButtonActive: { borderColor: theme.colors.accent },
    filterText: {
      color: theme.colors.foregroundMuted,
      fontSize: 12,
      fontWeight: "500",
      textAlign: "center",
    },
    filterTextActive: { color: theme.colors.foreground },
    notice: { borderRadius: 8, padding: 16, gap: 4 },
    noticeTitle: { color: theme.colors.foreground, fontSize: 12, lineHeight: 18, fontWeight: "600" },
    noticeErrorTitle: { color: theme.colors.statusDanger },
    noticeText: { color: theme.colors.foregroundMuted, fontSize: 12, lineHeight: 18, fontWeight: "400" },
    tree: { borderRadius: 10 },
    treeHeader: {
      minHeight: 44,
      paddingHorizontal: 16,
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
    },
    treeHeaderMain: { flex: 1, paddingLeft: 28 },
    treeHeaderText: {
      color: theme.colors.foregroundMuted,
      fontSize: 10,
      lineHeight: 15,
      fontWeight: "500",
    },
    treeHeaderStatus: { width: 180, textAlign: "right" },
    treeHeaderBase: { width: 200 },
    divider: { height: 1, backgroundColor: theme.colors.foregroundMuted, opacity: 0.18 },
    repositoryRow: {
      minHeight: 64,
      paddingHorizontal: 16,
      paddingVertical: 10,
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
    },
    disclosure: {
      width: 20,
      color: theme.colors.foregroundMuted,
      fontSize: 14,
      textAlign: "center",
      flexShrink: 0,
    },
    repositoryIdentity: { flex: 1, minWidth: 0, gap: 2 },
    repositoryName: {
      color: theme.colors.foreground,
      fontSize: 14,
      lineHeight: 20,
      fontWeight: "500",
    },
    repositoryPath: { color: theme.colors.foregroundMuted, fontSize: 10, lineHeight: 15, fontWeight: "400" },
    compactFacts: { color: theme.colors.foregroundMuted, fontSize: 10, lineHeight: 15, fontWeight: "400" },
    repositoryStatus: { width: 180, alignItems: "flex-end", gap: 2 },
    repositoryStatusValue: { color: theme.colors.foreground, fontSize: 12, lineHeight: 18, fontWeight: "500" },
    repositoryStatusError: { color: theme.colors.statusDanger },
    repositoryStatusCaption: { color: theme.colors.foregroundMuted, fontSize: 10, lineHeight: 15 },
    repositoryBase: {
      width: 200,
      color: theme.colors.foregroundMuted,
      fontSize: 10,
      lineHeight: 15,
      fontWeight: "400",
    },
    details: {
      paddingLeft: compact ? 16 : 48,
      paddingRight: 16,
      paddingBottom: 16,
      gap: 12,
    },
    detailMeta: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8 },
    detailMetaText: { color: theme.colors.foregroundMuted, fontSize: 10, lineHeight: 15, fontWeight: "400" },
    errorText: { color: theme.colors.statusDanger, fontSize: 12, lineHeight: 18, fontWeight: "400" },
    group: { gap: 4 },
    groupHeader: {
      minHeight: 36,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingHorizontal: 8,
    },
    groupLabel: { color: theme.colors.foreground, fontSize: 12, lineHeight: 18, fontWeight: "600" },
    groupCount: { color: theme.colors.foregroundMuted, fontSize: 10, lineHeight: 15, fontWeight: "400" },
    dataRow: {
      minHeight: 48,
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingHorizontal: 8,
      paddingVertical: 8,
    },
    rowCopy: { flex: 1, minWidth: 0, gap: 2 },
    rowTitle: { color: theme.colors.foreground, fontSize: 14, lineHeight: 20, fontWeight: "400" },
    rowSubtitle: { color: theme.colors.foregroundMuted, fontSize: 10, lineHeight: 15, fontWeight: "400" },
    workspacePath: {
      width: 320,
      color: theme.colors.foregroundMuted,
      fontSize: 10,
      lineHeight: 15,
      textAlign: "right",
      fontWeight: "400",
    },
    workspaceError: { color: theme.colors.statusDanger, fontSize: 10, lineHeight: 15, fontWeight: "400" },
    branchEvidence: {
      width: 300,
      color: theme.colors.foregroundMuted,
      fontSize: 10,
      lineHeight: 15,
      textAlign: "right",
      fontWeight: "400",
    },
    keepToggle: {
      minHeight: 44,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingHorizontal: 8,
    },
    keepToggleText: { color: theme.colors.foreground, fontSize: 12, lineHeight: 18, fontWeight: "500" },
    keepToggleHint: { color: theme.colors.foregroundMuted, fontSize: 10, marginLeft: "auto" },
    statePanel: {
      minHeight: 220,
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

function repositoryStatus(repository: RepositorySnapshot): { caption: string; value: string } {
  if (repository.error) {
    return { value: "조사 필요", caption: "저장소 오류" };
  }
  if (repository.cleanupCandidateCount > 0) {
    return {
      value: `정리 후보 ${repository.cleanupCandidateCount}`,
      caption: repository.reviewCount > 0 ? `검토 필요 ${repository.reviewCount}` : "병합 · 미체크아웃",
    };
  }
  if (repository.reviewCount > 0) {
    return { value: `검토 필요 ${repository.reviewCount}`, caption: "판단 근거 확인" };
  }
  return { value: "정돈됨", caption: "확인 항목 없음" };
}

function workspaceHead(workspace: WorkspaceSnapshot): string {
  if (workspace.currentBranch) {
    return workspace.currentBranch;
  }
  if (workspace.detached) {
    return `detached${workspace.headOid ? ` · ${workspace.headOid.slice(0, 8)}` : ""}`;
  }
  return "HEAD 미확인";
}

function branchEvidence(branch: BranchSnapshot): string {
  const merge = branch.mergeState === "merged"
    ? "병합됨"
    : branch.mergeState === "unmerged"
      ? "미병합"
      : "병합 미확인";
  const upstream = branch.upstreamState === "tracked"
    ? branch.upstreamRef ?? "upstream 정상"
    : branch.upstreamState === "gone"
      ? "upstream 소실"
      : branch.upstreamState === "local_only"
        ? "로컬 전용"
        : "upstream 미확인";
  const checkout = branch.checkoutState === "checked_out"
    ? `checkout ${branch.checkedOutAt.length}`
    : branch.checkoutState === "unknown"
      ? "checkout 미확인"
      : null;
  return [merge, upstream, checkout].filter(Boolean).join(" · ");
}

function SummaryMetric({ label, styles, value }: { label: string; styles: Styles; value: number }) {
  return (
    <View style={styles.summaryItem}>
      <Text style={styles.summaryValue}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

function WorkspaceRow({
  compact,
  styles,
  workspace,
}: {
  compact: boolean;
  styles: Styles;
  workspace: WorkspaceSnapshot;
}) {
  const dirtyLabel = workspace.isDirty === true
    ? "변경 있음"
    : workspace.isDirty === false
      ? "clean"
      : "상태 미확인";

  return (
    <View style={styles.dataRow}>
      <View style={styles.rowCopy}>
        <Text style={styles.rowTitle} numberOfLines={1}>{workspace.name}</Text>
        <Text style={styles.rowSubtitle} numberOfLines={1}>
          {workspaceHead(workspace)} · {dirtyLabel}
        </Text>
        {compact ? <Text style={styles.rowSubtitle} numberOfLines={2}>{workspace.directory}</Text> : null}
        {workspace.error ? <Text style={styles.workspaceError}>{workspace.error}</Text> : null}
      </View>
      {!compact ? <Text style={styles.workspacePath} numberOfLines={1}>{workspace.directory}</Text> : null}
    </View>
  );
}

function BranchRow({ branch, compact, styles }: {
  branch: BranchSnapshot;
  compact: boolean;
  styles: Styles;
}) {
  return (
    <View style={styles.dataRow}>
      <View style={styles.rowCopy}>
        <Text style={styles.rowTitle} numberOfLines={compact ? 2 : 1}>{branch.name}</Text>
        <Text style={styles.rowSubtitle}>{REASON_LABELS[branch.reason]}</Text>
        {compact ? <Text style={styles.rowSubtitle}>{branchEvidence(branch)}</Text> : null}
      </View>
      {!compact ? <Text style={styles.branchEvidence} numberOfLines={1}>{branchEvidence(branch)}</Text> : null}
    </View>
  );
}

function BranchGroup({
  branches,
  category,
  compact,
  styles,
}: {
  branches: BranchSnapshot[];
  category: BranchCategory;
  compact: boolean;
  styles: Styles;
}) {
  if (branches.length === 0) {
    return null;
  }

  return (
    <View style={styles.group}>
      <View style={styles.groupHeader}>
        <Text style={styles.groupLabel}>{CATEGORY_LABELS[category]}</Text>
        <Text style={styles.groupCount}>{branches.length}</Text>
      </View>
      {branches.map((branch) => (
        <BranchRow key={branch.ref} branch={branch} compact={compact} styles={styles} />
      ))}
    </View>
  );
}

function RepositoryNode({
  compact,
  focus,
  repository,
  styles,
}: {
  compact: boolean;
  focus: RepositoryFilter;
  repository: RepositorySnapshot;
  styles: Styles;
}) {
  const [open, setOpen] = useState(
    repository.cleanupCandidateCount > 0 || repository.reviewCount > 0 || Boolean(repository.error),
  );
  const [showKeep, setShowKeep] = useState(false);
  const status = repositoryStatus(repository);
  const cleanupBranches = repository.branches.filter((branch) => branch.category === "cleanup_candidate");
  const reviewBranches = repository.branches.filter((branch) => branch.category === "review");
  const keepBranches = repository.branches.filter((branch) => branch.category === "keep");
  const baseLabel = repository.base.state === "resolved"
    ? repository.base.ref ?? "기본 ref 미확인"
    : "기본 ref 미확인";

  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${repository.name} 저장소 ${open ? "접기" : "펼치기"}`}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((value) => !value)}
        style={({ pressed }) => [styles.repositoryRow, pressed ? styles.pressed : null]}
      >
        <Text style={styles.disclosure}>{open ? "▾" : "▸"}</Text>
        <View style={styles.repositoryIdentity}>
          <Text style={styles.repositoryName} numberOfLines={1}>{repository.name}</Text>
          <Text style={styles.repositoryPath} numberOfLines={1}>{repository.rootPath}</Text>
          {compact ? (
            <Text style={styles.compactFacts} numberOfLines={1}>
              {status.value} · 브랜치 {repository.branchCount} · Workspace {repository.workspaces.length}
            </Text>
          ) : null}
        </View>
        {!compact ? (
          <>
            <View style={styles.repositoryStatus}>
              <Text style={[styles.repositoryStatusValue, repository.error ? styles.repositoryStatusError : null]}>
                {status.value}
              </Text>
              <Text style={styles.repositoryStatusCaption}>{status.caption}</Text>
            </View>
            <Text style={styles.repositoryBase} numberOfLines={1}>{baseLabel}</Text>
          </>
        ) : null}
      </Pressable>

      {open ? (
        <View style={styles.details}>
          <View style={styles.detailMeta}>
            <Text style={styles.detailMetaText}>브랜치 {repository.branchCount}</Text>
            <View style={styles.dotSeparator} />
            <Text style={styles.detailMetaText}>Workspace {repository.workspaces.length}</Text>
            {compact ? (
              <>
                <View style={styles.dotSeparator} />
                <Text style={styles.detailMetaText} numberOfLines={1}>{baseLabel}</Text>
              </>
            ) : null}
          </View>

          {repository.error ? <Text style={styles.errorText}>{repository.error}</Text> : null}

          {repository.workspaces.length > 0 ? (
            <View style={styles.group}>
              <View style={styles.groupHeader}>
                <Text style={styles.groupLabel}>Workspace</Text>
                <Text style={styles.groupCount}>{repository.workspaces.length}</Text>
              </View>
              {repository.workspaces.map((workspace) => (
                <WorkspaceRow key={workspace.id} compact={compact} styles={styles} workspace={workspace} />
              ))}
            </View>
          ) : null}

          {focus !== "review" ? (
            <BranchGroup
              branches={cleanupBranches}
              category="cleanup_candidate"
              compact={compact}
              styles={styles}
            />
          ) : null}
          {focus !== "cleanup_candidate" ? (
            <BranchGroup branches={reviewBranches} category="review" compact={compact} styles={styles} />
          ) : null}

          {focus === "all" && keepBranches.length > 0 ? (
            <View style={styles.group}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${repository.name} 유지 브랜치 ${showKeep ? "접기" : "펼치기"}`}
                accessibilityState={{ expanded: showKeep }}
                onPress={() => setShowKeep((value) => !value)}
                style={({ pressed }) => [styles.keepToggle, pressed ? styles.pressed : null]}
              >
                <Text style={styles.disclosure}>{showKeep ? "▾" : "▸"}</Text>
                <Text style={styles.keepToggleText}>유지 브랜치 {keepBranches.length}</Text>
                <Text style={styles.keepToggleHint}>{showKeep ? "접기" : "펼치기"}</Text>
              </Pressable>
              {showKeep
                ? keepBranches.map((branch) => (
                    <BranchRow key={branch.ref} branch={branch} compact={compact} styles={styles} />
                  ))
                : null}
            </View>
          ) : null}

          {repository.branches.length === 0 && !repository.error ? (
            <Text style={styles.detailMetaText}>표시할 로컬 브랜치가 없습니다.</Text>
          ) : null}
        </View>
      ) : null}
      <View style={styles.divider} />
    </View>
  );
}

function FullScreenState({
  message,
  onRetry,
  retrying,
  styles,
  theme,
  title,
}: {
  message: string;
  onRetry?: () => void;
  retrying?: boolean;
  styles: Styles;
  theme: PluginTheme;
  title: string;
}) {
  return (
    <View style={[styles.screen, styles.content]}>
      <View style={styles.shell}>
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
              accessibilityLabel="Branch Garden 조사 다시 시도"
              disabled={retrying}
              onPress={onRetry}
              style={({ pressed }) => [
                styles.primaryButton,
                pressed ? styles.pressed : null,
                retrying ? styles.disabled : null,
              ]}
            >
              <Text style={styles.primaryButtonText}>{retrying ? "조사 중…" : "다시 시도"}</Text>
            </Pressable>
          ) : null}
        </TintedSurface>
      </View>
    </View>
  );
}

export function MainSurface({ theme, layout, host }: PluginSurfaceProps) {
  const scan = useRpc(branchGardenScan);
  const [filter, setFilter] = useState<RepositoryFilter>("all");
  const styles = useMemo(() => createStyles(theme, layout.compact), [theme, layout.compact]);
  const query = useQuery({
    queryKey: ["branch-garden", "scan", host.id],
    queryFn: () => scan({}),
    staleTime: Infinity,
    retry: false,
    refetchInterval: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  if (query.isPending && !query.data) {
    return (
      <FullScreenState
        message="선택한 Host의 Workspace와 로컬 Git 정보를 읽고 있습니다."
        styles={styles}
        theme={theme}
        title="Workspace와 브랜치를 불러오는 중"
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
        title="브랜치 현황을 불러오지 못했습니다"
      />
    );
  }

  const result = query.data;
  const visibleRepositories = filterRepositories(result.repositories, filter);
  const filterCounts: Record<RepositoryFilter, number> = {
    all: result.repositories.length,
    cleanup_candidate: filterRepositories(result.repositories, "cleanup_candidate").length,
    review: filterRepositories(result.repositories, "review").length,
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.shell}>
        <View style={styles.overview}>
          <View style={styles.overviewCopy}>
            <Text style={styles.description}>
              선택한 Host의 Workspace, 저장소, 로컬 브랜치 상태를 읽기 전용으로 보여줍니다.
            </Text>
            <View style={styles.metadata}>
              <Text style={styles.metaText}>읽기 전용</Text>
              <View style={styles.dotSeparator} />
              <Text style={styles.metaText}>마지막 조사 {formatScanTime(result.scannedAt)}</Text>
              {result.skippedNonGitCount > 0 ? (
                <>
                  <View style={styles.dotSeparator} />
                  <Text style={styles.metaText}>non-Git Workspace {result.skippedNonGitCount}개 제외</Text>
                </>
              ) : null}
            </View>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="브랜치 현황 새로고침"
            accessibilityState={{ disabled: query.isFetching }}
            disabled={query.isFetching}
            onPress={() => void query.refetch()}
            style={({ pressed }) => [
              styles.primaryButton,
              pressed ? styles.pressed : null,
              query.isFetching ? styles.disabled : null,
            ]}
          >
            <Text style={styles.primaryButtonText}>{query.isFetching ? "조사 중…" : "새로고침"}</Text>
          </Pressable>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionCopy}>
            <Text style={styles.sectionTitle}>개요</Text>
            <Text style={styles.sectionDescription}>현재 조사 결과의 전체 규모입니다.</Text>
          </View>
          <TintedSurface tone={theme.colors.foregroundMuted} opacity={0.04} style={styles.summary} styles={styles}>
            <SummaryMetric label="정리 후보" styles={styles} value={result.summary.cleanupCandidateCount} />
            <SummaryMetric label="Workspace" styles={styles} value={result.summary.workspaceCount} />
            <SummaryMetric label="저장소" styles={styles} value={result.summary.repositoryCount} />
            <SummaryMetric label="로컬 브랜치" styles={styles} value={result.summary.branchCount} />
            <SummaryMetric label="경고" styles={styles} value={result.summary.warningCount} />
          </TintedSurface>
        </View>

        {query.error ? (
          <TintedSurface tone={theme.colors.statusDanger} opacity={0.05} style={styles.notice} styles={styles}>
            <Text style={[styles.noticeTitle, styles.noticeErrorTitle]}>마지막 성공 결과를 표시하고 있습니다</Text>
            <Text style={styles.noticeText}>새로고침 실패: {errorMessage(query.error)}</Text>
          </TintedSurface>
        ) : null}

        {result.warnings.length > 0 ? (
          <TintedSurface tone={theme.colors.foregroundMuted} opacity={0.04} style={styles.notice} styles={styles}>
            <Text style={styles.noticeTitle}>일부 항목을 완전히 조사하지 못했습니다 · {result.warnings.length}</Text>
            {result.warnings.map((warning, index) => (
              <Text key={`${index}:${warning}`} style={styles.noticeText}>• {warning}</Text>
            ))}
          </TintedSurface>
        ) : null}

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionCopy}>
              <Text style={styles.sectionTitle}>저장소</Text>
              <Text style={styles.sectionDescription}>저장소를 펼쳐 Workspace와 판단 근거를 확인합니다.</Text>
            </View>
            <View accessibilityRole="tablist" style={styles.filters}>
              {FILTERS.map((item) => {
                const selected = filter === item.id;
                return (
                  <Pressable
                    key={item.id}
                    accessibilityRole="tab"
                    accessibilityLabel={`${item.label} 저장소 ${filterCounts[item.id]}개`}
                    accessibilityState={{ selected }}
                    onPress={() => setFilter(item.id)}
                    style={({ pressed }) => [
                      styles.filterButton,
                      selected ? styles.filterButtonActive : null,
                      pressed ? styles.pressed : null,
                    ]}
                  >
                    <Text style={[styles.filterText, selected ? styles.filterTextActive : null]}>
                      {item.label} {filterCounts[item.id]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {result.repositories.length === 0 ? (
            <TintedSurface tone={theme.colors.foregroundMuted} opacity={0.04} style={styles.statePanel} styles={styles}>
              <Text style={styles.stateTitle}>표시할 Git 저장소가 없습니다</Text>
              <Text style={styles.stateText}>선택한 Host에 Git Workspace가 추가되면 이곳에 표시됩니다.</Text>
            </TintedSurface>
          ) : visibleRepositories.length === 0 ? (
            <TintedSurface tone={theme.colors.foregroundMuted} opacity={0.04} style={styles.statePanel} styles={styles}>
              <Text style={styles.stateTitle}>이 필터에 해당하는 저장소가 없습니다</Text>
              <Text style={styles.stateText}>다른 필터를 선택해 전체 저장소를 확인하세요.</Text>
            </TintedSurface>
          ) : (
            <TintedSurface tone={theme.colors.foregroundMuted} opacity={0.025} style={styles.tree} styles={styles}>
              {!layout.compact ? (
                <>
                  <View style={styles.treeHeader}>
                    <Text style={[styles.treeHeaderText, styles.treeHeaderMain]}>저장소</Text>
                    <Text style={[styles.treeHeaderText, styles.treeHeaderStatus]}>상태</Text>
                    <Text style={[styles.treeHeaderText, styles.treeHeaderBase]}>기준 ref</Text>
                  </View>
                  <View style={styles.divider} />
                </>
              ) : null}
              {visibleRepositories.map((repository) => (
                <RepositoryNode
                  key={repository.id}
                  compact={layout.compact}
                  focus={filter}
                  repository={repository}
                  styles={styles}
                />
              ))}
            </TintedSurface>
          )}
        </View>

        <Text style={styles.footnote}>Workspace와 Git ref는 변경하지 않습니다.</Text>
      </View>
    </ScrollView>
  );
}
