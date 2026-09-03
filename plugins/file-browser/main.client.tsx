import { Icon, type PluginSurfaceProps, type PluginTheme, useRpc } from "@getpaseo/plugin";
import { useInfiniteQuery, useMutation, useQuery } from "@tanstack/react-query";
import React, { useEffect, useMemo, useState } from "react";
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import {
  fileBrowserCreateDownload,
  fileBrowserListDirectory,
  fileBrowserListRoots,
  fileBrowserPreviewFile,
  type DirectoryEntry,
} from "./file-browser.shared";
import {
  breadcrumbSegments,
  enterDirectory,
  flattenDirectoryPages,
  parentDirectory,
} from "./file-browser.view";

const ROOT_ID = "projects";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "요청을 완료하지 못했습니다.";
}

function iconFor(entry: DirectoryEntry): string {
  if (entry.kind === "directory") return "Folder";
  if (entry.kind === "file") return "FileText";
  if (entry.kind === "link") return "Link2";
  return "FileQuestion";
}

function kindLabel(entry: DirectoryEntry): string {
  if (entry.kind === "directory") return "폴더";
  if (entry.kind === "link") return "링크 · 열 수 없음";
  if (entry.kind === "other") return "지원하지 않는 항목";
  if (entry.previewStatus === "sensitive") return "민감 파일 · 접근 차단";
  return "파일 · 다운로드 가능";
}

function createStyles(theme: PluginTheme, compact: boolean) {
  return StyleSheet.create({
    screen: {
      flex: 1,
      padding: compact ? 16 : 24,
      gap: 16,
      backgroundColor: theme.colors.surface0,
    },
    toolbar: {
      minHeight: 44,
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
    },
    breadcrumbs: { flex: 1 },
    breadcrumbContent: { alignItems: "center", gap: 4, paddingRight: 8 },
    breadcrumbButton: {
      minHeight: 40,
      justifyContent: "center",
      paddingHorizontal: 8,
      borderRadius: 8,
    },
    breadcrumbText: { color: theme.colors.foreground, fontSize: 13 },
    breadcrumbSeparator: { color: theme.colors.foregroundMuted, fontSize: 14 },
    iconButton: {
      width: 44,
      height: 44,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: 10,
      backgroundColor: theme.colors.surface2,
    },
    content: {
      flex: 1,
      flexDirection: compact ? "column" : "row",
      gap: 16,
      minHeight: 0,
    },
    panel: {
      flex: 1,
      minWidth: 0,
      minHeight: 0,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: 12,
      backgroundColor: theme.colors.surface1,
      overflow: "hidden",
    },
    panelHeader: {
      minHeight: 48,
      paddingHorizontal: 16,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
    },
    panelTitle: { flex: 1, color: theme.colors.foreground, fontSize: 14, fontWeight: "600" },
    panelMeta: { color: theme.colors.foregroundMuted, fontSize: 12 },
    downloadButton: {
      minHeight: 40,
      paddingHorizontal: 12,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      borderRadius: 8,
      backgroundColor: theme.colors.accent,
    },
    downloadButtonText: {
      color: theme.colors.accentForeground,
      fontSize: 13,
      fontWeight: "600",
    },
    actionError: {
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
      backgroundColor: theme.colors.surface2,
    },
    actionErrorText: { color: theme.colors.statusDanger, fontSize: 12 },
    listContent: { paddingVertical: 4 },
    row: {
      minHeight: 52,
      paddingHorizontal: 16,
      paddingVertical: 8,
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.border,
    },
    selectedRow: { backgroundColor: theme.colors.surface2 },
    rowCopy: { flex: 1, minWidth: 0, gap: 2 },
    rowName: { color: theme.colors.foreground, fontSize: 14 },
    rowMeta: { color: theme.colors.foregroundMuted, fontSize: 12 },
    disabled: { opacity: 0.55 },
    state: {
      flex: 1,
      minHeight: 180,
      alignItems: "center",
      justifyContent: "center",
      padding: 24,
      gap: 8,
    },
    stateTitle: { color: theme.colors.foreground, fontSize: 14, fontWeight: "600", textAlign: "center" },
    stateText: { color: theme.colors.foregroundMuted, fontSize: 12, textAlign: "center" },
    errorText: { color: theme.colors.statusDanger, fontSize: 12, textAlign: "center" },
    secondaryButton: {
      minHeight: 44,
      paddingHorizontal: 16,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: 10,
      backgroundColor: theme.colors.surface2,
    },
    secondaryButtonText: { color: theme.colors.foreground, fontSize: 14, fontWeight: "500" },
    previewScroll: { flex: 1 },
    previewContent: { padding: 16, gap: 12 },
    previewPath: { color: theme.colors.foregroundMuted, fontSize: 12 },
    previewNotice: {
      padding: 12,
      borderRadius: 8,
      backgroundColor: theme.colors.surface2,
      color: theme.colors.foregroundMuted,
      fontSize: 12,
    },
    previewText: { color: theme.colors.foreground, fontSize: 13, lineHeight: 20 },
    compactBack: {
      minHeight: 44,
      paddingHorizontal: 4,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    compactBackText: { color: theme.colors.foreground, fontSize: 14, fontWeight: "500" },
  });
}

export function MainSurface({ theme, host, layout }: PluginSurfaceProps) {
  const styles = useMemo(() => createStyles(theme, layout.compact), [theme, layout.compact]);
  const listRoots = useRpc(fileBrowserListRoots);
  const listDirectory = useRpc(fileBrowserListDirectory);
  const previewFile = useRpc(fileBrowserPreviewFile);
  const createDownload = useRpc(fileBrowserCreateDownload);
  const [location, setLocation] = useState({ hostId: host.id, segments: [] as string[] });
  const [selection, setSelection] = useState<{ hostId: string; entry: DirectoryEntry } | null>(null);

  const segments = location.hostId === host.id ? location.segments : [];
  const selectedEntry = selection?.hostId === host.id ? selection.entry : null;

  const downloadMutation = useMutation({
    mutationFn: async (input: { rootId: string; segments: string[] }) => {
      const download = await createDownload(input);
      await Linking.openURL(download.url);
      return download;
    },
  });

  useEffect(() => {
    setLocation({ hostId: host.id, segments: [] });
    setSelection(null);
    downloadMutation.reset();
    // The mutation object is stable; only a Host change should reset surface state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [host.id]);

  const rootsQuery = useQuery({
    queryKey: ["file-browser", host.id, "roots"],
    queryFn: () => listRoots({}),
  });
  const activeRoot = rootsQuery.data?.roots.find((root) => root.id === ROOT_ID);

  const directoryQuery = useInfiniteQuery({
    queryKey: ["file-browser", host.id, ROOT_ID, "directory", ...segments],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      listDirectory({ rootId: ROOT_ID, segments, cursor: pageParam }),
    getNextPageParam: (lastPage) => lastPage.pageInfo.nextCursor ?? undefined,
    enabled: activeRoot?.available === true,
  });

  const previewQuery = useQuery({
    queryKey: [
      "file-browser",
      host.id,
      ROOT_ID,
      "preview",
      ...segments,
      selectedEntry?.name ?? "",
    ],
    queryFn: () =>
      previewFile({ rootId: ROOT_ID, segments: [...segments, selectedEntry!.name] }),
    enabled: selectedEntry?.kind === "file" && selectedEntry.previewStatus === "available",
  });

  const entries = flattenDirectoryPages(directoryQuery.data?.pages);
  const breadcrumbs = breadcrumbSegments(segments);
  const showingCompactPreview = layout.compact && selectedEntry !== null;

  function navigate(nextSegments: string[]) {
    setLocation({ hostId: host.id, segments: nextSegments });
    setSelection(null);
    downloadMutation.reset();
  }

  function chooseEntry(entry: DirectoryEntry) {
    if (entry.kind === "directory") {
      navigate(enterDirectory(segments, entry.name));
    } else if (entry.kind === "file" && entry.previewStatus === "available") {
      setSelection({ hostId: host.id, entry });
      downloadMutation.reset();
    }
  }

  function startDownload() {
    if (!selectedEntry || downloadMutation.isPending) return;
    downloadMutation.mutate({
      rootId: ROOT_ID,
      segments: [...segments, selectedEntry.name],
    });
  }

  function renderDownloadButton() {
    if (!selectedEntry) return null;
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${selectedEntry.name} 다운로드`}
        accessibilityState={{
          busy: downloadMutation.isPending,
          disabled: downloadMutation.isPending,
        }}
        disabled={downloadMutation.isPending}
        onPress={startDownload}
        style={[styles.downloadButton, downloadMutation.isPending && styles.disabled]}
      >
        <Icon name="Download" size={16} color={theme.colors.accentForeground} />
        <Text style={styles.downloadButtonText}>
          {downloadMutation.isPending ? "준비 중" : "다운로드"}
        </Text>
      </Pressable>
    );
  }

  function renderDownloadError() {
    if (!downloadMutation.isError) return null;
    return (
      <View style={styles.actionError} accessibilityLiveRegion="polite">
        <Text style={styles.actionErrorText}>{errorMessage(downloadMutation.error)}</Text>
      </View>
    );
  }

  function refreshCurrent() {
    const requests: Promise<unknown>[] = [directoryQuery.refetch()];
    if (selectedEntry) requests.push(previewQuery.refetch());
    void Promise.all(requests);
  }

  function renderPreview() {
    if (!selectedEntry) {
      return (
        <View style={styles.state}>
          <Icon name="FileText" size={24} color={theme.colors.foregroundMuted} />
          <Text style={styles.stateTitle}>미리 볼 파일을 선택하세요</Text>
          <Text style={styles.stateText}>텍스트 파일을 선택하면 최대 64 KiB를 표시합니다.</Text>
        </View>
      );
    }
    if (previewQuery.isPending) {
      return (
        <View style={styles.state}>
          <Text style={styles.stateTitle}>파일을 읽는 중입니다</Text>
          <Text style={styles.stateText}>{selectedEntry.name}</Text>
        </View>
      );
    }
    if (previewQuery.isError) {
      return (
        <View style={styles.state}>
          <Icon name="CircleAlert" size={24} color={theme.colors.statusDanger} />
          <Text style={styles.stateTitle}>파일을 미리 볼 수 없습니다</Text>
          <Text style={styles.errorText}>{errorMessage(previewQuery.error)}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="파일 미리보기 다시 시도"
            onPress={() => void previewQuery.refetch()}
            style={styles.secondaryButton}
          >
            <Text style={styles.secondaryButtonText}>다시 시도</Text>
          </Pressable>
        </View>
      );
    }
    const preview = previewQuery.data;
    return (
      <ScrollView style={styles.previewScroll} contentContainerStyle={styles.previewContent}>
        <Text style={styles.previewPath}>{preview.displayPath}</Text>
        {preview.truncated ? (
          <Text style={styles.previewNotice}>파일의 처음 64 KiB만 표시합니다.</Text>
        ) : null}
        <Text selectable style={styles.previewText}>{preview.content || "빈 파일입니다."}</Text>
      </ScrollView>
    );
  }

  if (rootsQuery.isPending) {
    return (
      <View style={styles.screen}>
        <View style={styles.state}>
          <Text style={styles.stateTitle}>파일 루트를 확인하는 중입니다</Text>
          <Text style={styles.stateText}>{host.label}</Text>
        </View>
      </View>
    );
  }

  if (rootsQuery.isError || !activeRoot?.available) {
    return (
      <View style={styles.screen}>
        <View style={styles.state}>
          <Icon name="FolderX" size={24} color={theme.colors.statusDanger} />
          <Text style={styles.stateTitle}>C:\Projects를 열 수 없습니다</Text>
          <Text style={styles.errorText}>
            {rootsQuery.isError ? errorMessage(rootsQuery.error) : "선택한 Host에서 폴더를 찾을 수 없습니다."}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="파일 루트 다시 확인"
            onPress={() => void rootsQuery.refetch()}
            style={styles.secondaryButton}
          >
            <Text style={styles.secondaryButtonText}>다시 확인</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.toolbar}>
        <ScrollView
          horizontal
          style={styles.breadcrumbs}
          contentContainerStyle={styles.breadcrumbContent}
          showsHorizontalScrollIndicator={false}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Projects 루트로 이동"
            onPress={() => navigate([])}
            style={styles.breadcrumbButton}
          >
            <Text style={styles.breadcrumbText}>{activeRoot.path}</Text>
          </Pressable>
          {breadcrumbs.map((crumb) => (
            <React.Fragment key={crumb.segments.join("\\")}>
              <Text style={styles.breadcrumbSeparator}>›</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${crumb.label} 폴더로 이동`}
                onPress={() => navigate(crumb.segments)}
                style={styles.breadcrumbButton}
              >
                <Text style={styles.breadcrumbText}>{crumb.label}</Text>
              </Pressable>
            </React.Fragment>
          ))}
        </ScrollView>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="현재 폴더 새로고침"
          accessibilityState={{
            busy: directoryQuery.isFetching || previewQuery.isFetching,
            disabled: directoryQuery.isFetching || previewQuery.isFetching,
          }}
          disabled={directoryQuery.isFetching || previewQuery.isFetching}
          onPress={refreshCurrent}
          style={[
            styles.iconButton,
            (directoryQuery.isFetching || previewQuery.isFetching) && styles.disabled,
          ]}
        >
          <Icon name="RefreshCw" size={18} color={theme.colors.foreground} />
        </Pressable>
      </View>

      {showingCompactPreview ? (
        <View style={styles.content}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="폴더 목록으로 돌아가기"
            onPress={() => setSelection(null)}
            style={styles.compactBack}
          >
            <Icon name="ArrowLeft" size={18} color={theme.colors.foreground} />
            <Text style={styles.compactBackText}>폴더 목록</Text>
          </Pressable>
          <View style={styles.panel}>
            <View style={styles.panelHeader}>
              <Text style={styles.panelTitle} numberOfLines={1}>{selectedEntry.name}</Text>
              {renderDownloadButton()}
            </View>
            {renderDownloadError()}
            {renderPreview()}
          </View>
        </View>
      ) : (
        <View style={styles.content}>
          <View style={styles.panel}>
            <View style={styles.panelHeader}>
              {segments.length > 0 ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="상위 폴더로 이동"
                  onPress={() => navigate(parentDirectory(segments))}
                  style={styles.iconButton}
                >
                  <Icon name="ArrowUp" size={18} color={theme.colors.foreground} />
                </Pressable>
              ) : null}
              <Text style={styles.panelTitle}>폴더 내용</Text>
              <Text style={styles.panelMeta}>{entries.length}개 표시</Text>
            </View>

            {directoryQuery.isPending ? (
              <View style={styles.state}>
                <Text style={styles.stateTitle}>폴더를 읽는 중입니다</Text>
              </View>
            ) : directoryQuery.isError ? (
              <View style={styles.state}>
                <Icon name="CircleAlert" size={24} color={theme.colors.statusDanger} />
                <Text style={styles.stateTitle}>폴더를 읽을 수 없습니다</Text>
                <Text style={styles.errorText}>{errorMessage(directoryQuery.error)}</Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="폴더 목록 다시 시도"
                  onPress={() => void directoryQuery.refetch()}
                  style={styles.secondaryButton}
                >
                  <Text style={styles.secondaryButtonText}>다시 시도</Text>
                </Pressable>
              </View>
            ) : entries.length === 0 ? (
              <View style={styles.state}>
                <Icon name="FolderOpen" size={24} color={theme.colors.foregroundMuted} />
                <Text style={styles.stateTitle}>빈 폴더입니다</Text>
                <Text style={styles.stateText}>표시할 파일이나 하위 폴더가 없습니다.</Text>
              </View>
            ) : (
              <ScrollView style={styles.previewScroll} contentContainerStyle={styles.listContent}>
                {entries.map((entry) => {
                  const actionable =
                    entry.kind === "directory" ||
                    (entry.kind === "file" && entry.previewStatus === "available");
                  const selected = selectedEntry?.name === entry.name;
                  return (
                    <Pressable
                      key={`${entry.kind}:${entry.name}`}
                      accessibilityRole="button"
                      accessibilityLabel={`${entry.name}, ${kindLabel(entry)}`}
                      accessibilityState={{ disabled: !actionable, selected }}
                      disabled={!actionable}
                      onPress={() => chooseEntry(entry)}
                      style={[
                        styles.row,
                        selected && styles.selectedRow,
                        !actionable && styles.disabled,
                      ]}
                    >
                      <Icon
                        name={iconFor(entry)}
                        size={18}
                        color={entry.previewStatus === "sensitive" ? theme.colors.statusWarning : theme.colors.foregroundMuted}
                      />
                      <View style={styles.rowCopy}>
                        <Text style={styles.rowName} numberOfLines={1}>{entry.name}</Text>
                        <Text style={styles.rowMeta}>{kindLabel(entry)}</Text>
                      </View>
                      {actionable ? (
                        <Icon name="ChevronRight" size={18} color={theme.colors.foregroundMuted} />
                      ) : null}
                    </Pressable>
                  );
                })}
                {directoryQuery.hasNextPage ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="폴더 항목 더 보기"
                    accessibilityState={{
                      busy: directoryQuery.isFetchingNextPage,
                      disabled: directoryQuery.isFetchingNextPage,
                    }}
                    disabled={directoryQuery.isFetchingNextPage}
                    onPress={() => void directoryQuery.fetchNextPage()}
                    style={[styles.secondaryButton, directoryQuery.isFetchingNextPage && styles.disabled]}
                  >
                    <Text style={styles.secondaryButtonText}>
                      {directoryQuery.isFetchingNextPage ? "불러오는 중" : "더 보기"}
                    </Text>
                  </Pressable>
                ) : null}
              </ScrollView>
            )}
          </View>

          {!layout.compact ? (
            <View style={styles.panel}>
              <View style={styles.panelHeader}>
                <Text style={styles.panelTitle} numberOfLines={1}>{selectedEntry?.name ?? "미리보기"}</Text>
                {renderDownloadButton()}
              </View>
              {renderDownloadError()}
              {renderPreview()}
            </View>
          ) : null}
        </View>
      )}
    </View>
  );
}
