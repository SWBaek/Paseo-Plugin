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
  projectId: string;
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

export interface ProjectListEntry {
  id: string;
  displayName: string;
  rootPath: string;
  kind: "git" | "directory" | "non_git";
}

export interface ProjectListResult {
  projects: ProjectListEntry[];
}

export interface ProjectSource {
  list(): Promise<ProjectListResult>;
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

export interface ScanSources {
  projects: ProjectSource;
  workspaces: WorkspacePageSource;
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

interface DiscoveredLocation {
  commonDirectory: string;
  commonDirectoryKey: string;
  topLevel: string;
  directory: string;
  priority: number;
}

interface LocationDiscovery {
  location: DiscoveredLocation | null;
  error: string | null;
}

interface ProjectDiscovery {
  project: ProjectListEntry;
  root: LocationDiscovery;
  workspaces: Array<{
    workspace: WorkspaceListEntry;
    discovery: LocationDiscovery;
  }>;
}

interface RepositoryGroup {
  projects: Map<string, ProjectListEntry>;
  workspaces: Map<string, WorkspaceListEntry>;
  locations: Map<string, DiscoveredLocation>;
  warnings: string[];
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

async function discoverLocation(
  directory: string,
  priority: number,
  git: GitRunner,
): Promise<DiscoveredLocation> {
  const { stdout } = await git(directory, [
    "rev-parse",
    "--path-format=absolute",
    "--git-common-dir",
    "--show-toplevel",
  ]);
  const lines = stdout.split(/\r?\n/u).filter(Boolean);
  if (lines.length < 2) {
    throw new Error("Git did not return a common directory and worktree root.");
  }

  const commonDirectory = normalizeAbsolutePath(directory, lines[0]);
  return {
    commonDirectory,
    commonDirectoryKey: repositoryKey(commonDirectory),
    topLevel: normalizeAbsolutePath(directory, lines[1]),
    directory,
    priority,
  };
}

async function tryDiscoverLocation(
  directory: string,
  priority: number,
  git: GitRunner,
): Promise<LocationDiscovery> {
  if (!directory.trim()) {
    return { location: null, error: "경로가 비어 있습니다." };
  }
  try {
    return { location: await discoverLocation(directory, priority, git), error: null };
  } catch (error) {
    return { location: null, error: formatError(error) };
  }
}

async function discoverProjects(
  projects: readonly ProjectListEntry[],
  workspacesByProject: ReadonlyMap<string, WorkspaceListEntry[]>,
  git: GitRunner,
  concurrency: number,
): Promise<ProjectDiscovery[]> {
  const targets = projects.flatMap((project) => [
    { kind: "project" as const, project },
    ...(workspacesByProject.get(project.id) ?? []).map((workspace) => ({
      kind: "workspace" as const,
      project,
      workspace,
    })),
  ]);
  const attempts = await mapLimit(targets, concurrency, async (target) => ({
    target,
    discovery: await tryDiscoverLocation(
      target.kind === "project" ? target.project.rootPath : target.workspace.workspaceDirectory,
      target.kind === "project" ? 0 : 1,
      git,
    ),
  }));
  const discoveries = new Map<string, ProjectDiscovery>(
    projects.map((project) => [
      project.id,
      {
        project,
        root: { location: null, error: "Project root를 조사하지 못했습니다." },
        workspaces: [],
      },
    ]),
  );

  for (const { target, discovery } of attempts) {
    const projectDiscovery = discoveries.get(target.project.id)!;
    if (target.kind === "project") {
      projectDiscovery.root = discovery;
    } else {
      projectDiscovery.workspaces.push({ workspace: target.workspace, discovery });
    }
  }
  return projects.map((project) => discoveries.get(project.id)!);
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

function projectName(project: ProjectListEntry): string {
  return project.displayName.trim() || path.basename(project.rootPath) || project.id;
}

function failedRepository(
  project: ProjectListEntry,
  workspaces: readonly WorkspaceListEntry[],
  messages: readonly string[],
): RepositorySnapshot {
  const warnings = messages.filter(
    (message, index, collection) => collection.indexOf(message) === index,
  );
  const error = warnings[0] ?? "Git 저장소를 조사할 수 없습니다.";
  return {
    id: `project:${project.id}`,
    name: projectName(project),
    rootPath: project.rootPath,
    commonDirectory: null,
    base: emptyBase(),
    workspaces: workspaces.map((workspace) => ({
      id: workspace.id,
      name: workspace.title?.trim() || workspace.name,
      directory: workspace.workspaceDirectory,
      currentBranch: workspace.gitRuntime?.currentBranch ?? null,
      headOid: null,
      detached: false,
      isDirty: workspace.gitRuntime?.isDirty ?? null,
      error,
    })),
    branches: [],
    branchCount: 0,
    cleanupCandidateCount: 0,
    reviewCount: 0,
    error,
    warnings,
  };
}

async function scanRepository(
  group: RepositoryGroup,
  git: GitRunner,
  concurrency: number,
): Promise<RepositorySnapshot> {
  const projects = [...group.projects.values()].sort((left, right) =>
    `${projectName(left)}\0${left.rootPath}\0${left.id}`.localeCompare(
      `${projectName(right)}\0${right.rootPath}\0${right.id}`,
    ),
  );
  const members = [...group.workspaces.values()].sort((left, right) =>
    `${left.name}\0${left.workspaceDirectory}\0${left.id}`.localeCompare(
      `${right.name}\0${right.workspaceDirectory}\0${right.id}`,
    ),
  );
  const locations = [...group.locations.values()].sort(
    (left, right) =>
      left.priority - right.priority || left.directory.localeCompare(right.directory),
  );
  const representativeProject = projects[0];
  const representativeLocation = locations[0];
  const cwd = representativeLocation.directory;
  const warnings: string[] = [...group.warnings];

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
      async (workspace) => scanWorkspaceStatus(workspace, git),
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
      id: representativeLocation.commonDirectoryKey,
      name: projectName(representativeProject),
      rootPath: representativeProject.rootPath || representativeLocation.topLevel,
      commonDirectory: representativeLocation.commonDirectory,
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
    id: representativeLocation.commonDirectoryKey,
    name: projectName(representativeProject),
    rootPath: representativeProject.rootPath || representativeLocation.topLevel,
    commonDirectory: representativeLocation.commonDirectory,
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

function createRepositoryGroup(): RepositoryGroup {
  return {
    projects: new Map(),
    workspaces: new Map(),
    locations: new Map(),
    warnings: [],
  };
}

function locationKey(location: DiscoveredLocation): string {
  return `${location.priority}:${repositoryKey(path.normalize(location.directory))}`;
}

function getRepositoryGroup(
  groups: Map<string, RepositoryGroup>,
  commonDirectoryKey: string,
): RepositoryGroup {
  const existing = groups.get(commonDirectoryKey);
  if (existing) {
    return existing;
  }
  const created = createRepositoryGroup();
  groups.set(commonDirectoryKey, created);
  return created;
}

function projectFromWorkspace(workspace: WorkspaceListEntry): ProjectListEntry {
  return {
    id: workspace.projectId,
    displayName: workspace.projectDisplayName,
    rootPath: workspace.projectRootPath,
    kind: workspace.projectKind,
  };
}

export async function scanBranchGarden(
  sources: ScanSources,
  options: ScanOptions = {},
): Promise<BranchGardenScanResult> {
  const git = options.git ?? createGitRunner();
  const concurrency = Math.max(1, options.concurrency ?? DEFAULT_CONCURRENCY);
  const pageLimit = Math.max(1, options.pageLimit ?? DEFAULT_PAGE_LIMIT);
  const [projectResult, workspaces] = await Promise.all([
    sources.projects.list(),
    listAllWorkspaces(sources.workspaces, pageLimit),
  ]);
  const activeWorkspaces = workspaces.filter((workspace) => workspace.archivingAt === null);
  const warnings: string[] = [];
  const projectsById = new Map<string, ProjectListEntry>();

  for (const project of projectResult.projects) {
    projectsById.set(project.id, project);
  }
  for (const workspace of activeWorkspaces) {
    if (projectsById.has(workspace.projectId)) {
      continue;
    }
    projectsById.set(workspace.projectId, projectFromWorkspace(workspace));
    warnings.push(
      `${workspace.projectDisplayName}: Project 목록에 없어 활성 Workspace 정보로 복구했습니다.`,
    );
  }

  const projects = [...projectsById.values()];
  const skippedNonGitProjectCount = projects.filter((project) => project.kind !== "git").length;
  const gitProjects = projects.filter((project) => project.kind === "git");
  const workspacesByProject = new Map<string, WorkspaceListEntry[]>();
  for (const workspace of activeWorkspaces) {
    if (projectsById.get(workspace.projectId)?.kind !== "git") {
      continue;
    }
    const members = workspacesByProject.get(workspace.projectId) ?? [];
    members.push(workspace);
    workspacesByProject.set(workspace.projectId, members);
  }

  const discoveries = await discoverProjects(
    gitProjects,
    workspacesByProject,
    git,
    concurrency,
  );

  const groups = new Map<string, RepositoryGroup>();
  const repositories: RepositorySnapshot[] = [];
  for (const discovery of discoveries) {
    const successfulLocations = [
      discovery.root.location,
      ...discovery.workspaces.map(
        ({ discovery: workspaceDiscovery }) => workspaceDiscovery.location,
      ),
    ].filter((location): location is DiscoveredLocation => location !== null);
    const groupKeys = [
      ...new Set(successfulLocations.map((location) => location.commonDirectoryKey)),
    ];
    const projectWorkspaces = discovery.workspaces.map(({ workspace }) => workspace);

    if (groupKeys.length === 0) {
      const messages = [
        `${projectName(discovery.project)}: Project root Git 저장소 판별 실패: ${discovery.root.error ?? "알 수 없는 오류"}`,
        ...discovery.workspaces
          .filter(({ discovery: workspaceDiscovery }) => workspaceDiscovery.error)
          .map(
            ({ workspace, discovery: workspaceDiscovery }) =>
              `${workspace.name}: Workspace Git 저장소 판별 실패: ${workspaceDiscovery.error}`,
          ),
      ];
      repositories.push(failedRepository(discovery.project, projectWorkspaces, messages));
      continue;
    }

    for (const key of groupKeys) {
      getRepositoryGroup(groups, key).projects.set(discovery.project.id, discovery.project);
    }
    for (const location of successfulLocations) {
      const group = getRepositoryGroup(groups, location.commonDirectoryKey);
      group.locations.set(locationKey(location), location);
    }

    const fallbackGroupKey = discovery.root.location?.commonDirectoryKey ?? groupKeys[0];
    if (discovery.root.error) {
      getRepositoryGroup(groups, fallbackGroupKey).warnings.push(
        `${projectName(discovery.project)}: Project root 조사 실패: ${discovery.root.error}`,
      );
    }
    for (const { workspace, discovery: workspaceDiscovery } of discovery.workspaces) {
      const key = workspaceDiscovery.location?.commonDirectoryKey ?? fallbackGroupKey;
      const group = getRepositoryGroup(groups, key);
      group.projects.set(discovery.project.id, discovery.project);
      group.workspaces.set(workspace.id, workspace);
      if (workspaceDiscovery.error) {
        group.warnings.push(
          `${workspace.name}: Workspace Git 저장소 판별 실패: ${workspaceDiscovery.error}`,
        );
      }
    }
  }

  const scannedRepositories = await mapLimit(
    [...groups.values()],
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
      projectCount: gitProjects.length,
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
    skippedNonGitProjectCount,
    repositories,
    warnings: allWarnings,
  };
}
