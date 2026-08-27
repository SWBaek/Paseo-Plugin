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
      paddingHorizontal: compact ? 12 : 28,
      paddingTop: compact ? 14 : 24,
      paddingBottom: compact ? 32 : 56,
    },
    shell: {
      width: "100%",
      maxWidth: 1180,
      alignSelf: "center",
      gap: compact ? 14 : 18,
    },
    tintedSurface: { position: "relative", overflow: "hidden" },
    tintLayer: { ...StyleSheet.absoluteFillObject },
    header: { gap: compact ? 14 : 16, paddingBottom: compact ? 16 : 20 },
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
      fontSize: compact ? 27 : 32,
      lineHeight: compact ? 33 : 38,
      fontWeight: "800",
      letterSpacing: -0.8,
    },
    subtitle: { color: theme.colors.foregroundMuted, fontSize: 13, lineHeight: 19 },
    refreshButton: {
      minHeight: 38,
      paddingHorizontal: 15,
      paddingVertical: 9,
      borderRadius: 9,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.colors.accent,
    },
    refreshButtonText: {
      color: theme.colors.accentForeground,
      fontSize: 12,
      fontWeight: "800",
    },
    pressed: { opacity: 0.78 },
    disabled: { opacity: 0.5 },
    headerMeta: {
      flexDirection: "row",
      alignItems: "center",
      flexWrap: "wrap",
      gap: 8,
    },
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
    dotSeparator: {
      width: 3,
      height: 3,
      borderRadius: 999,
      backgroundColor: theme.colors.foregroundMuted,
      opacity: 0.55,
    },
    divider: { height: 1, backgroundColor: theme.colors.foregroundMuted, opacity: 0.16 },
    summaryBar: {
      flexDirection: "row",
      flexWrap: "wrap",
      alignItems: "center",
      borderRadius: 11,
      paddingHorizontal: compact ? 10 : 14,
      paddingVertical: compact ? 8 : 10,
      gap: compact ? 4 : 0,
    },
    summaryItem: {
      flexGrow: 1,
      flexBasis: compact ? "46%" : 0,
      minWidth: compact ? 126 : 0,
      paddingHorizontal: compact ? 8 : 14,
      paddingVertical: compact ? 7 : 5,
      flexDirection: "row",
      alignItems: "baseline",
      gap: 6,
    },
    summaryValue: {
      color: theme.colors.foreground,
      fontSize: compact ? 18 : 20,
      lineHeight: 24,
      fontWeight: "800",
      letterSpacing: -0.4,
    },
    summaryValueAccent: { color: theme.colors.accent },
    summaryLabel: { color: theme.colors.foregroundMuted, fontSize: 11, fontWeight: "600" },
    summarySeparator: {
      width: 1,
      height: 22,
      backgroundColor: theme.colors.foregroundMuted,
      opacity: 0.16,
    },
    callout: { paddingHorizontal: 14, paddingVertical: 11, gap: 4 },
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
    toolbar: {
      flexDirection: compact ? "column" : "row",
      alignItems: compact ? "stretch" : "flex-end",
      justifyContent: "space-between",
      gap: 12,
    },
    toolbarCopy: { gap: 3 },
    sectionTitle: {
      color: theme.colors.foreground,
      fontSize: compact ? 19 : 21,
      lineHeight: compact ? 25 : 27,
      fontWeight: "800",
      letterSpacing: -0.35,
    },
    sectionDescription: { color: theme.colors.foregroundMuted, fontSize: 11, lineHeight: 17 },
    filters: {
      flexDirection: "row",
      alignSelf: compact ? "stretch" : "flex-start",
      borderRadius: 9,
      padding: 3,
      gap: 2,
    },
    filterButton: {
      flex: compact ? 1 : 0,
      flexShrink: 0,
      minWidth: compact ? 0 : 88,
      minHeight: 31,
      paddingHorizontal: compact ? 8 : 11,
      paddingVertical: 7,
      borderRadius: 7,
      alignItems: "center",
      justifyContent: "center",
    },
    filterButtonActive: { backgroundColor: theme.colors.accent },
    filterText: {
      color: theme.colors.foregroundMuted,
      fontSize: 11,
      fontWeight: "700",
      textAlign: "center",
    },
    filterTextActive: { color: theme.colors.accentForeground },
    tree: { borderRadius: compact ? 9 : 12 },
    treeHeader: {
      minHeight: 35,
      paddingHorizontal: compact ? 10 : 14,
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
    },
    treeHeaderMain: { flex: 1, paddingLeft: 28 },
    treeHeaderText: {
      color: theme.colors.foregroundMuted,
      fontSize: 9,
      fontWeight: "900",
      letterSpacing: 0.9,
    },
    treeHeaderStatus: { width: 196, textAlign: "right" },
    treeHeaderBase: { width: 205, textAlign: "left" },
    repositoryNode: { position: "relative" },
    repositoryRow: {
      minHeight: compact ? 58 : 62,
      paddingHorizontal: compact ? 10 : 14,
      paddingVertical: 10,
      flexDirection: "row",
      alignItems: "center",
      gap: compact ? 7 : 10,
    },
    disclosure: {
      width: 18,
      color: theme.colors.foregroundMuted,
      fontSize: 12,
      textAlign: "center",
      flexShrink: 0,
    },
    repositoryDot: { width: 7, height: 7, borderRadius: 999, flexShrink: 0 },
    repositoryIdentity: { flex: 1, minWidth: 0, gap: 2 },
    repositoryName: {
      color: theme.colors.foreground,
      fontSize: compact ? 14 : 15,
      lineHeight: 20,
      fontWeight: "800",
    },
    repositoryPath: { color: theme.colors.foregroundMuted, fontSize: 10, lineHeight: 15 },
    compactFacts: { color: theme.colors.foregroundMuted, fontSize: 10, lineHeight: 15 },
    repositoryStatus: { width: 196, alignItems: "flex-end", gap: 2 },
    repositoryStatusValue: { color: theme.colors.foreground, fontSize: 12, fontWeight: "800" },
    repositoryStatusCaption: { color: theme.colors.foregroundMuted, fontSize: 10 },
    repositoryBase: {
      width: 205,
      color: theme.colors.foregroundMuted,
      fontSize: 10,
      lineHeight: 15,
    },
    details: {
      position: "relative",
      paddingLeft: compact ? 25 : 46,
      paddingRight: compact ? 8 : 14,
      paddingBottom: compact ? 10 : 12,
    },
    treeGuide: {
      position: "absolute",
      top: 0,
      bottom: 12,
      left: compact ? 18 : 31,
      width: 1,
      backgroundColor: theme.colors.foregroundMuted,
      opacity: 0.2,
    },
    detailMeta: {
      minHeight: 29,
      paddingHorizontal: 8,
      flexDirection: "row",
      alignItems: "center",
      flexWrap: "wrap",
      gap: 7,
    },
    detailMetaText: { color: theme.colors.foregroundMuted, fontSize: 10, lineHeight: 15 },
    group: { gap: 0 },
    groupHeader: {
      minHeight: 30,
      flexDirection: "row",
      alignItems: "center",
      gap: 7,
      paddingHorizontal: 7,
    },
    connector: {
      width: 17,
      color: theme.colors.foregroundMuted,
      opacity: 0.72,
      fontSize: 12,
      textAlign: "center",
      flexShrink: 0,
    },
    groupDot: { width: 6, height: 6, borderRadius: 999, flexShrink: 0 },
    groupLabel: {
      color: theme.colors.foregroundMuted,
      fontSize: 10,
      fontWeight: "900",
      letterSpacing: 0.75,
    },
    groupCount: { color: theme.colors.foregroundMuted, fontSize: 10, fontWeight: "700" },
    workspaceRow: {
      minHeight: 45,
      flexDirection: "row",
      alignItems: "center",
      gap: 7,
      paddingHorizontal: 7,
      paddingVertical: 6,
    },
    workspaceDot: { width: 6, height: 6, borderRadius: 999, flexShrink: 0 },
    rowCopy: { flex: 1, minWidth: 0, gap: 1 },
    rowTitle: {
      color: theme.colors.foreground,
      fontSize: 12,
      lineHeight: 17,
      fontWeight: "700",
    },
    rowSubtitle: { color: theme.colors.foregroundMuted, fontSize: 10, lineHeight: 15 },
    workspacePath: {
      width: 330,
      color: theme.colors.foregroundMuted,
      fontSize: 10,
      lineHeight: 15,
      textAlign: "right",
    },
    workspaceError: { color: theme.colors.statusDanger, fontSize: 10, lineHeight: 15 },
    branchRow: {
      minHeight: compact ? 46 : 42,
      flexDirection: "row",
      alignItems: "center",
      gap: 7,
      paddingHorizontal: 7,
      paddingVertical: 5,
    },
    branchEvidence: {
      width: 310,
      color: theme.colors.foregroundMuted,
      fontSize: 10,
      lineHeight: 15,
      textAlign: "right",
    },
    keepToggle: {
      minHeight: 32,
      flexDirection: "row",
      alignItems: "center",
      gap: 7,
      paddingHorizontal: 7,
    },
    keepToggleText: {
      color: theme.colors.foregroundMuted,
      fontSize: 10,
      fontWeight: "800",
      letterSpacing: 0.7,
    },
    keepToggleHint: { color: theme.colors.foregroundMuted, fontSize: 10, marginLeft: "auto" },
    errorText: { color: theme.colors.statusDanger, fontSize: 10, lineHeight: 16 },
    emptyState: {
      minHeight: 190,
      padding: 24,
      alignItems: "center",
      justifyContent: "center",
      gap: 5,
    },
    emptyTitle: {
      color: theme.colors.foreground,
      fontSize: 18,
      fontWeight: "800",
      textAlign: "center",
    },
    emptyText: {
      color: theme.colors.foregroundMuted,
      fontSize: 12,
      lineHeight: 18,
      textAlign: "center",
      maxWidth: 520,
    },
    loadingLine: { height: 10, borderRadius: 999, marginTop: 5 },
    loadingWide: { width: "72%" },
    loadingShort: { width: "38%" },
    footnote: {
      color: theme.colors.foregroundMuted,
      fontSize: 10,
      lineHeight: 16,
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

function repositoryTone(repository: RepositorySnapshot, theme: PluginTheme): string {
  if (repository.error) {
    return theme.colors.statusDanger;
  }
  return repository.cleanupCandidateCount > 0 ? theme.colors.accent : theme.colors.foregroundMuted;
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

function SummaryMetric({
  accent = false,
  label,
  styles,
  value,
}: {
  accent?: boolean;
  label: string;
  styles: Styles;
  value: number;
}) {
  return (
    <View style={styles.summaryItem}>
      <Text style={[styles.summaryValue, accent ? styles.summaryValueAccent : null]}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

function WorkspaceRow({
  compact,
  isLast,
  styles,
  theme,
  workspace,
}: {
  compact: boolean;
  isLast: boolean;
  styles: Styles;
  theme: PluginTheme;
  workspace: WorkspaceSnapshot;
}) {
  const dirtyLabel = workspace.isDirty === true
    ? "변경 있음"
    : workspace.isDirty === false
      ? "clean"
      : "상태 미확인";
  const tone = workspace.error
    ? theme.colors.statusDanger
    : workspace.isDirty
      ? theme.colors.accent
      : theme.colors.foregroundMuted;

  return (
    <View style={styles.workspaceRow}>
      <Text style={styles.connector}>{isLast ? "└" : "├"}</Text>
      <View style={[styles.workspaceDot, { backgroundColor: tone }]} />
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

function BranchRow({
  branch,
  compact,
  isLast,
  styles,
  theme,
}: {
  branch: BranchSnapshot;
  compact: boolean;
  isLast: boolean;
  styles: Styles;
  theme: PluginTheme;
}) {
  const tone = branch.category === "cleanup_candidate"
    ? theme.colors.accent
    : branch.category === "review"
      ? theme.colors.statusDanger
      : theme.colors.foregroundMuted;
  const opacity = branch.category === "cleanup_candidate"
    ? 0.045
    : branch.category === "review"
      ? 0.018
      : 0;

  return (
    <TintedSurface tone={tone} opacity={opacity} style={styles.branchRow} styles={styles}>
      <Text style={styles.connector}>{isLast ? "└" : "├"}</Text>
      <View style={[styles.groupDot, { backgroundColor: tone }]} />
      <View style={styles.rowCopy}>
        <Text style={styles.rowTitle} numberOfLines={compact ? 2 : 1}>{branch.name}</Text>
        <Text style={styles.rowSubtitle}>{REASON_LABELS[branch.reason]}</Text>
        {compact ? <Text style={styles.rowSubtitle}>{branchEvidence(branch)}</Text> : null}
      </View>
      {!compact ? <Text style={styles.branchEvidence} numberOfLines={1}>{branchEvidence(branch)}</Text> : null}
    </TintedSurface>
  );
}

function BranchGroup({
  branches,
  category,
  compact,
  styles,
  theme,
}: {
  branches: BranchSnapshot[];
  category: BranchCategory;
  compact: boolean;
  styles: Styles;
  theme: PluginTheme;
}) {
  if (branches.length === 0) {
    return null;
  }
  const tone = category === "cleanup_candidate"
    ? theme.colors.accent
    : category === "review"
      ? theme.colors.statusDanger
      : theme.colors.foregroundMuted;

  return (
    <View style={styles.group}>
      <View style={styles.groupHeader}>
        <Text style={styles.connector}>├</Text>
        <View style={[styles.groupDot, { backgroundColor: tone }]} />
        <Text style={styles.groupLabel}>{CATEGORY_LABELS[category]}</Text>
        <Text style={styles.groupCount}>{branches.length}</Text>
      </View>
      {branches.map((branch, index) => (
        <BranchRow
          key={branch.ref}
          branch={branch}
          compact={compact}
          isLast={index === branches.length - 1}
          styles={styles}
          theme={theme}
        />
      ))}
    </View>
  );
}

function RepositoryNode({
  compact,
  focus,
  repository,
  styles,
  theme,
}: {
  compact: boolean;
  focus: RepositoryFilter;
  repository: RepositorySnapshot;
  styles: Styles;
  theme: PluginTheme;
}) {
  const [open, setOpen] = useState(
    repository.cleanupCandidateCount > 0 || repository.reviewCount > 0 || Boolean(repository.error),
  );
  const [showKeep, setShowKeep] = useState(false);
  const status = repositoryStatus(repository);
  const tone = repositoryTone(repository, theme);
  const cleanupBranches = repository.branches.filter((branch) => branch.category === "cleanup_candidate");
  const reviewBranches = repository.branches.filter((branch) => branch.category === "review");
  const keepBranches = repository.branches.filter((branch) => branch.category === "keep");
  const baseLabel = repository.base.state === "resolved"
    ? repository.base.ref ?? "기본 ref 미확인"
    : "기본 ref 미확인";

  return (
    <View style={styles.repositoryNode}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${repository.name} 저장소 ${open ? "접기" : "펼치기"}`}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((value) => !value)}
        style={({ pressed }) => [styles.repositoryRow, pressed ? styles.pressed : null]}
      >
        <Text style={styles.disclosure}>{open ? "▾" : "▸"}</Text>
        <View style={[styles.repositoryDot, { backgroundColor: tone }]} />
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
              <Text style={styles.repositoryStatusValue}>{status.value}</Text>
              <Text style={styles.repositoryStatusCaption}>{status.caption}</Text>
            </View>
            <Text style={styles.repositoryBase} numberOfLines={1}>{baseLabel}</Text>
          </>
        ) : null}
      </Pressable>

      {open ? (
        <View style={styles.details}>
          <View style={styles.treeGuide} />
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
                <Text style={styles.connector}>├</Text>
                <View style={[styles.groupDot, { backgroundColor: theme.colors.foregroundMuted }]} />
                <Text style={styles.groupLabel}>WORKSPACES</Text>
                <Text style={styles.groupCount}>{repository.workspaces.length}</Text>
              </View>
              {repository.workspaces.map((workspace, index) => (
                <WorkspaceRow
                  key={workspace.id}
                  compact={compact}
                  isLast={index === repository.workspaces.length - 1}
                  styles={styles}
                  theme={theme}
                  workspace={workspace}
                />
              ))}
            </View>
          ) : null}

          {focus !== "review" ? (
            <BranchGroup
              branches={cleanupBranches}
              category="cleanup_candidate"
              compact={compact}
              styles={styles}
              theme={theme}
            />
          ) : null}
          {focus !== "cleanup_candidate" ? (
            <BranchGroup
              branches={reviewBranches}
              category="review"
              compact={compact}
              styles={styles}
              theme={theme}
            />
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
                <Text style={styles.connector}>{showKeep ? "▾" : "▸"}</Text>
                <View style={[styles.groupDot, { backgroundColor: theme.colors.foregroundMuted }]} />
                <Text style={styles.keepToggleText}>유지 브랜치 {keepBranches.length}</Text>
                <Text style={styles.keepToggleHint}>{showKeep ? "접기" : "펼치기"}</Text>
              </Pressable>
              {showKeep
                ? keepBranches.map((branch, index) => (
                    <BranchRow
                      key={branch.ref}
                      branch={branch}
                      compact={compact}
                      isLast={index === keepBranches.length - 1}
                      styles={styles}
                      theme={theme}
                    />
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

function LoadingState({ styles, theme }: { styles: Styles; theme: PluginTheme }) {
  return (
    <View style={[styles.screen, styles.content]}>
      <View style={styles.shell}>
        <View style={styles.header}>
          <Text style={styles.eyebrow}>WORKSPACE BRANCH TREE</Text>
          <Text style={styles.title}>Branch Garden</Text>
          <Text style={styles.subtitle}>저장소 트리를 구성하고 있습니다.</Text>
          <TintedSurface
            tone={theme.colors.foregroundMuted}
            opacity={0.11}
            style={[styles.loadingLine, styles.loadingWide]}
            styles={styles}
          ><View /></TintedSurface>
          <TintedSurface
            tone={theme.colors.foregroundMuted}
            opacity={0.08}
            style={[styles.loadingLine, styles.loadingShort]}
            styles={styles}
          ><View /></TintedSurface>
        </View>
      </View>
    </View>
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : "알 수 없는 오류가 발생했습니다.";
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
    return <LoadingState styles={styles} theme={theme} />;
  }

  if (!query.data) {
    return (
      <View style={[styles.screen, styles.content]}>
        <View style={styles.shell}>
          <TintedSurface
            tone={theme.colors.statusDanger}
            opacity={0.055}
            style={styles.emptyState}
            styles={styles}
          >
            <Text style={styles.emptyTitle}>브랜치 현황을 불러오지 못했습니다.</Text>
            <Text style={styles.emptyText}>{errorMessage(query.error)}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Branch Garden 조사 다시 시도"
              disabled={query.isFetching}
              onPress={() => void query.refetch()}
              style={({ pressed }) => [
                styles.refreshButton,
                pressed ? styles.pressed : null,
                query.isFetching ? styles.disabled : null,
              ]}
            >
              <Text style={styles.refreshButtonText}>
                {query.isFetching ? "조사 중…" : "다시 시도"}
              </Text>
            </Pressable>
          </TintedSurface>
        </View>
      </View>
    );
  }

  const result = query.data;
  const visibleRepositories = filterRepositories(result.repositories, filter);
  const filterCounts: Record<RepositoryFilter, number> = {
    all: result.repositories.length,
    cleanup_candidate: filterRepositories(result.repositories, "cleanup_candidate").length,
    review: filterRepositories(result.repositories, "review").length,
  };
  const summary = [
    ["정리 후보", result.summary.cleanupCandidateCount, true],
    ["Workspace", result.summary.workspaceCount, false],
    ["저장소", result.summary.repositoryCount, false],
    ["로컬 브랜치", result.summary.branchCount, false],
    ["경고", result.summary.warningCount, false],
  ] as const;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.shell}>
        <View style={styles.header}>
          <View style={styles.headerTop}>
            <View style={styles.headerCopy}>
              <Text style={styles.eyebrow}>WORKSPACE BRANCH TREE</Text>
              <Text style={styles.title}>Branch Garden</Text>
              <Text style={styles.subtitle}>
                저장소, Workspace, 브랜치를 폴더 트리처럼 빠르게 훑어봅니다.
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Branch Garden 새로고침"
              disabled={query.isFetching}
              onPress={() => void query.refetch()}
              style={({ pressed }) => [
                styles.refreshButton,
                pressed ? styles.pressed : null,
                query.isFetching ? styles.disabled : null,
              ]}
            >
              <Text style={styles.refreshButtonText}>
                {query.isFetching ? "조사 중…" : "새로고침 ↻"}
              </Text>
            </Pressable>
          </View>
          <View style={styles.headerMeta}>
            <View style={styles.readOnlyPill}>
              <Text style={styles.readOnlyText}>READ ONLY</Text>
            </View>
            <Text style={styles.metaText}>로컬 ref 기준 · fetch 없음</Text>
            <View style={styles.dotSeparator} />
            <Text style={styles.metaText}>마지막 조사 {formatScanTime(result.scannedAt)}</Text>
          </View>
        </View>

        <View style={styles.divider} />

        <TintedSurface
          tone={theme.colors.foregroundMuted}
          opacity={0.035}
          style={styles.summaryBar}
          styles={styles}
        >
          {summary.map(([label, value, accent], index) => (
            <React.Fragment key={label}>
              {index > 0 && !layout.compact ? <View style={styles.summarySeparator} /> : null}
              <SummaryMetric accent={accent} label={label} styles={styles} value={value} />
            </React.Fragment>
          ))}
        </TintedSurface>

        {query.error ? (
          <TintedSurface
            tone={theme.colors.statusDanger}
            opacity={0.045}
            style={styles.callout}
            styles={styles}
          >
            <View style={styles.calloutRail} />
            <Text style={styles.calloutTitle}>마지막 성공 결과를 표시하고 있습니다.</Text>
            <Text style={styles.calloutText}>새로고침 실패: {errorMessage(query.error)}</Text>
          </TintedSurface>
        ) : null}

        {result.warnings.length > 0 ? (
          <TintedSurface
            tone={theme.colors.statusDanger}
            opacity={0.035}
            style={styles.callout}
            styles={styles}
          >
            <View style={styles.calloutRail} />
            <Text style={styles.calloutTitle}>부분 조사 경고 · {result.warnings.length}</Text>
            {result.warnings.map((warning, index) => (
              <Text key={`${index}:${warning}`} style={styles.calloutText}>• {warning}</Text>
            ))}
          </TintedSurface>
        ) : null}

        <View style={styles.toolbar}>
          <View style={styles.toolbarCopy}>
            <Text style={styles.sectionTitle}>저장소 트리</Text>
            <Text style={styles.sectionDescription}>
              {visibleRepositories.length}개 저장소 · 필요한 저장소는 펼치고 정돈된 저장소는 접었습니다.
            </Text>
          </View>
          <TintedSurface
            tone={theme.colors.foregroundMuted}
            opacity={0.055}
            style={styles.filters}
            styles={styles}
          >
            {FILTERS.map((item) => {
              const active = filter === item.id;
              return (
                <Pressable
                  key={item.id}
                  accessibilityRole="button"
                  accessibilityLabel={`${item.label} 저장소 필터`}
                  accessibilityState={{ selected: active }}
                  onPress={() => setFilter(item.id)}
                  style={[styles.filterButton, active ? styles.filterButtonActive : null]}
                >
                  <Text
                    numberOfLines={1}
                    style={[styles.filterText, active ? styles.filterTextActive : null]}
                  >
                    {item.label} {filterCounts[item.id]}
                  </Text>
                </Pressable>
              );
            })}
          </TintedSurface>
        </View>

        {result.repositories.length === 0 ? (
          <TintedSurface
            tone={theme.colors.foregroundMuted}
            opacity={0.03}
            style={styles.emptyState}
            styles={styles}
          >
            <Text style={styles.emptyTitle}>표시할 Git Workspace가 없습니다.</Text>
            <Text style={styles.emptyText}>
              선택한 호스트에서 활성 Git Workspace를 찾지 못했습니다.
            </Text>
          </TintedSurface>
        ) : visibleRepositories.length === 0 ? (
          <TintedSurface
            tone={theme.colors.foregroundMuted}
            opacity={0.03}
            style={styles.emptyState}
            styles={styles}
          >
            <Text style={styles.emptyTitle}>이 조건에 해당하는 저장소가 없습니다.</Text>
            <Text style={styles.emptyText}>다른 필터를 선택해 전체 트리를 확인해 보세요.</Text>
          </TintedSurface>
        ) : (
          <TintedSurface
            tone={theme.colors.foregroundMuted}
            opacity={0.018}
            style={styles.tree}
            styles={styles}
          >
            {!layout.compact ? (
              <TintedSurface
                tone={theme.colors.foregroundMuted}
                opacity={0.04}
                style={styles.treeHeader}
                styles={styles}
              >
                <Text style={[styles.treeHeaderText, styles.treeHeaderMain]}>REPOSITORY</Text>
                <Text style={[styles.treeHeaderText, styles.treeHeaderStatus]}>STATUS</Text>
                <Text style={[styles.treeHeaderText, styles.treeHeaderBase]}>BASE REF</Text>
              </TintedSurface>
            ) : null}
            {visibleRepositories.map((repository) => (
              <RepositoryNode
                key={repository.id}
                compact={layout.compact}
                focus={filter}
                repository={repository}
                styles={styles}
                theme={theme}
              />
            ))}
          </TintedSurface>
        )}

        <Text style={styles.footnote}>
          non-Git Workspace {result.skippedNonGitCount}개 제외 · Workspace와 Git ref는 변경하지 않습니다.
        </Text>
      </View>
    </ScrollView>
  );
}
