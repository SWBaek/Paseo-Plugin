import { execFile } from "node:child_process";
import path from "node:path";
import { classifyBranch } from "./branch-garden.logic";
import type {
  BaseResolution,
  BaseSource,
  BranchGardenScanResult,
  BranchSnapshot,
  CheckoutState,
  MergeState,
  RepositorySnapshot,
  UpstreamState,
  WorkspaceSnapshot,
} from "./branch-garden.shared";

const DEFAULT_PAGE_LIMIT = 100;
const DEFAULT_CONCURRENCY = 4;
const GIT_TIMEOUT_MS = 15_000;
const GIT_MAX_BUFFER_BYTES = 4 * 1024 * 1024;

export interface WorkspaceListEntry {
  id: string;
  projectDisplayName: string;
  projectRootPath: string;
  projectKind: "git" | "directory" | "non_git";
  workspaceDirectory: string;
  name: string;
  title: string | null;
  archivingAt: string | null;
  gitRuntime: {
    currentBranch: string | null;
    isDirty: boolean | null;
  } | null;
}

export interface WorkspacePage {
  entries: WorkspaceListEntry[];
  pageInfo: {
    nextCursor: string | null;
    hasMore: boolean;
  };
}

export interface WorkspacePageSource {
  list(page: { limit: number; cursor?: string }): Promise<WorkspacePage>;
}

export interface GitCommandResult {
  stdout: string;
  stderr: string;
}

export interface GitProcessOptions {
  cwd: string;
  env: NodeJS.ProcessEnv;
  encoding: "utf8";
  timeout: number;
  maxBuffer: number;
  windowsHide: true;
  shell: false;
}

export type GitProcessExecutor = (
  file: string,
  args: readonly string[],
  options: GitProcessOptions,
) => Promise<GitCommandResult>;

export type GitRunner = (cwd: string, args: readonly string[]) => Promise<GitCommandResult>;

export interface ScanOptions {
  git?: GitRunner;
  concurrency?: number;
  pageLimit?: number;
  now?: () => Date;
}

interface DiscoveredWorkspace {
  workspace: WorkspaceListEntry;
  commonDirectory: string;
  commonDirectoryKey: string;
  topLevel: string;
}

interface RawBranch {
  ref: string;
  name: string;
  upstreamRef: string | null;
  upstreamState: UpstreamState;
}

interface CommandAttempt {
  result: GitCommandResult | null;
  error: string | null;
}

const BASE_CANDIDATES: ReadonlyArray<{ ref: string; source: BaseSource }> = [
  { ref: "refs/remotes/origin/main", source: "origin_main" },
  { ref: "refs/remotes/origin/master", source: "origin_master" },
  { ref: "refs/heads/main", source: "local_main" },
  { ref: "refs/heads/master", source: "local_master" },
];

function executeGitProcess(
  file: string,
  args: readonly string[],
  options: GitProcessOptions,
): Promise<GitCommandResult> {
  return new Promise((resolve, reject) => {
    execFile(file, [...args], options, (error, stdout, stderr) => {
      if (error) {
        reject(error);
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

export function assertReadOnlyGitArgs(args: readonly string[]): void {
  const [command, ...rest] = args;

  if (command === "rev-parse" || command === "for-each-ref") {
    return;
  }

  if (
    command === "symbolic-ref" &&
    rest.length === 2 &&
    rest[0] === "-q" &&
    rest[1] === "refs/remotes/origin/HEAD"
  ) {
    return;
  }

  if (
    command === "worktree" &&
    rest.length === 3 &&
    rest[0] === "list" &&
    rest[1] === "--porcelain" &&
    rest[2] === "-z"
  ) {
    return;
  }

  if (
    command === "status" &&
    rest.length === 3 &&
    rest[0] === "--porcelain=v2" &&
    rest[1] === "--branch" &&
    rest[2] === "-z"
  ) {
    return;
  }

  throw new Error(`Blocked non-read-only Git command: ${args.join(" ")}`);
}

export function createGitRunner(executor: GitProcessExecutor = executeGitProcess): GitRunner {
  return async (cwd, args) => {
    assertReadOnlyGitArgs(args);
    return executor("git", args, {
      cwd,
      env: {
        ...process.env,
        GIT_OPTIONAL_LOCKS: "0",
        LC_ALL: "C",
      },
      encoding: "utf8",
      timeout: GIT_TIMEOUT_MS,
      maxBuffer: GIT_MAX_BUFFER_BYTES,
      windowsHide: true,
      shell: false,
    });
  };
}

function formatError(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }
  return String(error);
}

async function tryGit(git: GitRunner, cwd: string, args: readonly string[]): Promise<CommandAttempt> {
  try {
    return { result: await git(cwd, args), error: null };
  } catch (error) {
    return { result: null, error: formatError(error) };
  }
}

async function mapLimit<Input, Output>(
  items: readonly Input[],
  limit: number,
  task: (item: Input, index: number) => Promise<Output>,
): Promise<Output[]> {
  const results = new Array<Output>(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) {
        return;
      }
      results[index] = await task(items[index], index);
    }
  }

  const workerCount = Math.min(Math.max(1, limit), items.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

function normalizeAbsolutePath(cwd: string, value: string): string {
  return path.normalize(path.isAbsolute(value) ? value : path.resolve(cwd, value));
}

function repositoryKey(commonDirectory: string): string {
  return process.platform === "win32" ? commonDirectory.toLocaleLowerCase("en-US") : commonDirectory;
}

async function listAllWorkspaces(
  source: WorkspacePageSource,
  pageLimit: number,
): Promise<WorkspaceListEntry[]> {
  const entries: WorkspaceListEntry[] = [];
  const seenCursors = new Set<string>();
  let cursor: string | undefined;

  while (true) {
    const page = await source.list(cursor ? { limit: pageLimit, cursor } : { limit: pageLimit });
    entries.push(...page.entries);

    if (!page.pageInfo.hasMore) {
      return entries;
    }

    const nextCursor = page.pageInfo.nextCursor;
    if (!nextCursor || seenCursors.has(nextCursor)) {
      throw new Error("Workspace pagination returned an invalid or repeated cursor.");
    }
    seenCursors.add(nextCursor);
    cursor = nextCursor;
  }
}

async function discoverWorkspace(
  workspace: WorkspaceListEntry,
  git: GitRunner,
): Promise<DiscoveredWorkspace> {
  const { stdout } = await git(workspace.workspaceDirectory, [
    "rev-parse",
    "--path-format=absolute",
    "--git-common-dir",
    "--show-toplevel",
  ]);
  const lines = stdout.split(/\r?\n/u).filter(Boolean);
  if (lines.length < 2) {
    throw new Error("Git did not return a common directory and worktree root.");
  }

  const commonDirectory = normalizeAbsolutePath(workspace.workspaceDirectory, lines[0]);
  return {
    workspace,
    commonDirectory,
    commonDirectoryKey: repositoryKey(commonDirectory),
    topLevel: normalizeAbsolutePath(workspace.workspaceDirectory, lines[1]),
  };
}

function localBranchRefForBase(ref: string): string | null {
  const remotePrefix = "refs/remotes/origin/";
  if (ref.startsWith(remotePrefix)) {
    return `refs/heads/${ref.slice(remotePrefix.length)}`;
  }
  return ref.startsWith("refs/heads/") ? ref : null;
}

async function refExists(cwd: string, ref: string, git: GitRunner): Promise<boolean> {
  const attempt = await tryGit(git, cwd, ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`]);
  return attempt.result !== null;
}

export async function resolveBaseReference(cwd: string, git: GitRunner): Promise<BaseResolution> {
  const symbolic = await tryGit(git, cwd, ["symbolic-ref", "-q", "refs/remotes/origin/HEAD"]);
  const symbolicTarget = symbolic.result?.stdout.trim() ?? "";
  if (
    symbolicTarget.startsWith("refs/remotes/origin/") &&
    (await refExists(cwd, symbolicTarget, git))
  ) {
    return {
      state: "resolved",
      ref: symbolicTarget,
      localBranchRef: localBranchRefForBase(symbolicTarget),
      source: "origin_head",
    };
  }

  for (const candidate of BASE_CANDIDATES) {
    if (await refExists(cwd, candidate.ref, git)) {
      return {
        state: "resolved",
        ref: candidate.ref,
        localBranchRef: localBranchRefForBase(candidate.ref),
        source: candidate.source,
      };
    }
  }

  return { state: "unknown", ref: null, localBranchRef: null, source: null };
}

export function parseBranches(output: string): RawBranch[] {
  const tokens = output.split("\0");
  const branches: RawBranch[] = [];

  for (let index = 0; index + 3 < tokens.length; index += 4) {
    const ref = tokens[index].trim();
    const name = tokens[index + 1].trim();
    const upstreamRef = tokens[index + 2].trim() || null;
    const tracking = tokens[index + 3].trim();
    if (!ref || !name) {
      continue;
    }

    const upstreamState: UpstreamState = !upstreamRef
      ? "local_only"
      : tracking.includes("[gone]")
        ? "gone"
        : "tracked";
    branches.push({ ref, name, upstreamRef, upstreamState });
  }

  return branches;
}

export function parseWorktreeBranches(output: string): Map<string, string[]> {
  const checkedOut = new Map<string, string[]>();
  let currentPath: string | null = null;

  for (const token of output.split("\0")) {
    if (token.startsWith("worktree ")) {
      currentPath = token.slice("worktree ".length);
      continue;
    }
    if (token.startsWith("branch ") && currentPath) {
      const ref = token.slice("branch ".length);
      const paths = checkedOut.get(ref) ?? [];
      paths.push(currentPath);
      checkedOut.set(ref, paths);
    }
  }

  return checkedOut;
}

function parseMergedRefs(output: string): Set<string> {
  return new Set(output.split("\0").map((value) => value.trim()).filter(Boolean));
}

export function parseWorkspaceStatus(
  workspace: WorkspaceListEntry,
  output: string,
): WorkspaceSnapshot {
  let currentBranch: string | null = null;
  let headOid: string | null = null;
  let detached = false;
  let isDirty = false;

  for (const record of output.split("\0").filter(Boolean)) {
    if (record.startsWith("# branch.oid ")) {
      const oid = record.slice("# branch.oid ".length);
      headOid = oid === "(initial)" ? null : oid;
    } else if (record.startsWith("# branch.head ")) {
      const head = record.slice("# branch.head ".length);
      detached = head === "(detached)";
      currentBranch = detached || head === "(unknown)" ? null : head;
    } else if (!record.startsWith("# ")) {
      isDirty = true;
    }
  }

  return {
    id: workspace.id,
    name: workspace.title?.trim() || workspace.name,
    directory: workspace.workspaceDirectory,
    currentBranch,
    headOid,
    detached,
    isDirty,
    error: null,
  };
}

async function scanWorkspaceStatus(
  workspace: WorkspaceListEntry,
  git: GitRunner,
): Promise<WorkspaceSnapshot> {
  const attempt = await tryGit(git, workspace.workspaceDirectory, [
    "status",
    "--porcelain=v2",
    "--branch",
    "-z",
  ]);
  if (attempt.result) {
    return parseWorkspaceStatus(workspace, attempt.result.stdout);
  }

  return {
    id: workspace.id,
    name: workspace.title?.trim() || workspace.name,
    directory: workspace.workspaceDirectory,
    currentBranch: workspace.gitRuntime?.currentBranch ?? null,
    headOid: null,
    detached: false,
    isDirty: workspace.gitRuntime?.isDirty ?? null,
    error: `Workspace 상태 조사 실패: ${attempt.error ?? "알 수 없는 오류"}`,
  };
}

function emptyBase(): BaseResolution {
  return { state: "unknown", ref: null, localBranchRef: null, source: null };
}

function failedRepository(
  workspace: WorkspaceListEntry,
  message: string,
): RepositorySnapshot {
  const workspaceName = workspace.title?.trim() || workspace.name;
  return {
    id: `workspace:${workspace.id}`,
    name: workspace.projectDisplayName || workspaceName,
    rootPath: workspace.projectRootPath,
    commonDirectory: null,
    base: emptyBase(),
    workspaces: [
      {
        id: workspace.id,
        name: workspaceName,
        directory: workspace.workspaceDirectory,
        currentBranch: workspace.gitRuntime?.currentBranch ?? null,
        headOid: null,
        detached: false,
        isDirty: workspace.gitRuntime?.isDirty ?? null,
        error: message,
      },
    ],
    branches: [],
    branchCount: 0,
    cleanupCandidateCount: 0,
    reviewCount: 0,
    error: message,
    warnings: [message],
  };
}

async function scanRepository(
  discovered: readonly DiscoveredWorkspace[],
  git: GitRunner,
  concurrency: number,
): Promise<RepositorySnapshot> {
  const members = [...discovered].sort((left, right) =>
    `${left.workspace.name}\0${left.workspace.workspaceDirectory}`.localeCompare(
      `${right.workspace.name}\0${right.workspace.workspaceDirectory}`,
    ),
  );
  const representative = members[0];
  const cwd = representative.workspace.workspaceDirectory;
  const warnings: string[] = [];

  const [base, branchAttempt, worktreeAttempt, workspaces] = await Promise.all([
    resolveBaseReference(cwd, git),
    tryGit(git, cwd, [
      "for-each-ref",
      "--format=%(refname)%00%(refname:short)%00%(upstream)%00%(upstream:track)%00",
      "refs/heads",
    ]),
    tryGit(git, cwd, ["worktree", "list", "--porcelain", "-z"]),
    mapLimit(
      members,
      concurrency,
      async ({ workspace }) => scanWorkspaceStatus(workspace, git),
    ),
  ]);

  for (const workspace of workspaces) {
    if (workspace.error) {
      warnings.push(`${workspace.name}: ${workspace.error}`);
    }
  }
  if (base.state === "unknown") {
    warnings.push("기본 브랜치 ref를 판별하지 못해 정리 후보를 만들지 않았습니다.");
  }

  if (!branchAttempt.result) {
    const error = `로컬 브랜치 조사 실패: ${branchAttempt.error ?? "알 수 없는 오류"}`;
    warnings.push(error);
    return {
      id: representative.commonDirectoryKey,
      name: representative.workspace.projectDisplayName || representative.workspace.name,
      rootPath: representative.workspace.projectRootPath || representative.topLevel,
      commonDirectory: representative.commonDirectory,
      base,
      workspaces,
      branches: [],
      branchCount: 0,
      cleanupCandidateCount: 0,
      reviewCount: 0,
      error,
      warnings,
    };
  }

  const rawBranches = parseBranches(branchAttempt.result.stdout);
  const checkedOutByRef = worktreeAttempt.result
    ? parseWorktreeBranches(worktreeAttempt.result.stdout)
    : new Map<string, string[]>();
  const worktreeStateKnown = worktreeAttempt.result !== null;
  if (!worktreeStateKnown) {
    warnings.push(
      `worktree 체크아웃 상태 조사 실패: ${worktreeAttempt.error ?? "알 수 없는 오류"}`,
    );
    for (const workspace of workspaces) {
      if (!workspace.currentBranch) {
        continue;
      }
      const ref = `refs/heads/${workspace.currentBranch}`;
      const paths = checkedOutByRef.get(ref) ?? [];
      paths.push(workspace.directory);
      checkedOutByRef.set(ref, paths);
    }
  }

  let mergedRefs = new Set<string>();
  let mergeStateKnown = false;
  if (base.state === "resolved" && base.ref) {
    const mergedAttempt = await tryGit(git, cwd, [
      "for-each-ref",
      `--merged=${base.ref}`,
      "--format=%(refname)%00",
      "refs/heads",
    ]);
    if (mergedAttempt.result) {
      mergedRefs = parseMergedRefs(mergedAttempt.result.stdout);
      mergeStateKnown = true;
    } else {
      warnings.push(`병합 상태 조사 실패: ${mergedAttempt.error ?? "알 수 없는 오류"}`);
    }
  }

  const branches: BranchSnapshot[] = rawBranches
    .map((branch) => {
      const checkedOutAt = checkedOutByRef.get(branch.ref) ?? [];
      const checkoutState: CheckoutState = checkedOutAt.length > 0
        ? "checked_out"
        : worktreeStateKnown
          ? "not_checked_out"
          : "unknown";
      const mergeState: MergeState = mergeStateKnown
        ? mergedRefs.has(branch.ref)
          ? "merged"
          : "unmerged"
        : "unknown";
      const isDefault = base.localBranchRef === branch.ref;
      const classification = classifyBranch({
        isDefault,
        checkoutState,
        baseResolved: base.state === "resolved",
        mergeState,
        upstreamState: branch.upstreamState,
      });

      return {
        name: branch.name,
        ref: branch.ref,
        category: classification.category,
        reason: classification.reason,
        isDefault,
        checkoutState,
        checkedOutAt,
        mergeState,
        upstreamState: branch.upstreamState,
        upstreamRef: branch.upstreamRef,
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name));

  return {
    id: representative.commonDirectoryKey,
    name: representative.workspace.projectDisplayName || representative.workspace.name,
    rootPath: representative.workspace.projectRootPath || representative.topLevel,
    commonDirectory: representative.commonDirectory,
    base,
    workspaces,
    branches,
    branchCount: branches.length,
    cleanupCandidateCount: branches.filter((branch) => branch.category === "cleanup_candidate").length,
    reviewCount: branches.filter((branch) => branch.category === "review").length,
    error: null,
    warnings,
  };
}

export async function scanBranchGarden(
  source: WorkspacePageSource,
  options: ScanOptions = {},
): Promise<BranchGardenScanResult> {
  const git = options.git ?? createGitRunner();
  const concurrency = Math.max(1, options.concurrency ?? DEFAULT_CONCURRENCY);
  const pageLimit = Math.max(1, options.pageLimit ?? DEFAULT_PAGE_LIMIT);
  const workspaces = await listAllWorkspaces(source, pageLimit);
  const activeWorkspaces = workspaces.filter((workspace) => workspace.archivingAt === null);
  const skippedNonGitCount = activeWorkspaces.filter(
    (workspace) => workspace.projectKind !== "git",
  ).length;
  const warnings: string[] = [];
  const gitWorkspaces = activeWorkspaces.filter((workspace) => {
    if (workspace.projectKind !== "git") {
      return false;
    }
    if (!workspace.workspaceDirectory.trim()) {
      warnings.push(`${workspace.name}: Workspace 디렉터리가 없어 조사하지 못했습니다.`);
      return false;
    }
    return true;
  });

  const discoveries = await mapLimit(gitWorkspaces, concurrency, async (workspace) => {
    try {
      return { discovered: await discoverWorkspace(workspace, git), failed: null };
    } catch (error) {
      const message = `${workspace.name}: Git 저장소 판별 실패: ${formatError(error)}`;
      return { discovered: null, failed: failedRepository(workspace, message) };
    }
  });

  const grouped = new Map<string, DiscoveredWorkspace[]>();
  const repositories: RepositorySnapshot[] = [];
  for (const discovery of discoveries) {
    if (discovery.failed) {
      repositories.push(discovery.failed);
      continue;
    }
    if (!discovery.discovered) {
      continue;
    }
    const group = grouped.get(discovery.discovered.commonDirectoryKey) ?? [];
    group.push(discovery.discovered);
    grouped.set(discovery.discovered.commonDirectoryKey, group);
  }

  const scannedRepositories = await mapLimit(
    [...grouped.values()],
    concurrency,
    (group) => scanRepository(group, git, concurrency),
  );
  repositories.push(...scannedRepositories);
  repositories.sort(
    (left, right) =>
      right.cleanupCandidateCount - left.cleanupCandidateCount ||
      left.name.localeCompare(right.name) ||
      left.rootPath.localeCompare(right.rootPath),
  );

  const allWarnings = [
    ...warnings,
    ...repositories.flatMap((repository) => repository.warnings),
  ].filter((warning, index, collection) => collection.indexOf(warning) === index);

  return {
    scannedAt: (options.now ?? (() => new Date()))().toISOString(),
    summary: {
      workspaceCount: repositories.reduce(
        (total, repository) => total + repository.workspaces.length,
        0,
      ),
      repositoryCount: repositories.length,
      branchCount: repositories.reduce(
        (total, repository) => total + repository.branchCount,
        0,
      ),
      cleanupCandidateCount: repositories.reduce(
        (total, repository) => total + repository.cleanupCandidateCount,
        0,
      ),
      warningCount: allWarnings.length,
    },
    skippedNonGitCount,
    repositories,
    warnings: allWarnings,
  };
}
