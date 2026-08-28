import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BranchGardenScanResultSchema } from "./branch-garden.shared";
import {
  assertReadOnlyGitArgs,
  createGitRunner,
  parseBranches,
  parseWorkspaceStatus,
  parseWorktreeBranches,
  resolveBaseReference,
  scanBranchGarden,
  type GitProcessExecutor,
  type GitRunner,
  type ProjectListEntry,
  type ScanSources,
  type WorkspaceListEntry,
  type WorkspacePageSource,
} from "./branch-garden.server";

const temporaryRoots: string[] = [];

function createTemporaryRoot(): string {
  const root = mkdtempSync(path.join(tmpdir(), "branch-garden-test-"));
  temporaryRoots.push(root);
  return root;
}

function removeTemporaryRoot(target: string): void {
  const resolvedTarget = path.resolve(target);
  const resolvedTemp = path.resolve(tmpdir());
  const comparableTarget = process.platform === "win32" ? resolvedTarget.toLowerCase() : resolvedTarget;
  const comparableTemp = process.platform === "win32" ? resolvedTemp.toLowerCase() : resolvedTemp;
  if (
    !comparableTarget.startsWith(`${comparableTemp}${path.sep}`) ||
    !path.basename(resolvedTarget).startsWith("branch-garden-test-")
  ) {
    throw new Error(`Refusing to remove non-fixture path: ${resolvedTarget}`);
  }
  rmSync(resolvedTarget, { recursive: true, force: true });
}

afterEach(() => {
  while (temporaryRoots.length > 0) {
    removeTemporaryRoot(temporaryRoots.pop()!);
  }
});

function fixtureGit(cwd: string, args: readonly string[]): string {
  return execFileSync("git", [...args], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, LC_ALL: "C" },
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function workspace(
  id: string,
  directory: string,
  overrides: Partial<WorkspaceListEntry> = {},
): WorkspaceListEntry {
  return {
    id,
    projectId: "fixture-project",
    projectDisplayName: "Fixture Repository",
    projectRootPath: directory,
    projectKind: "git",
    workspaceDirectory: directory,
    name: id,
    title: null,
    archivingAt: null,
    gitRuntime: null,
    ...overrides,
  };
}

function project(
  id: string,
  rootPath: string,
  overrides: Partial<ProjectListEntry> = {},
): ProjectListEntry {
  return {
    id,
    displayName: "Fixture Repository",
    rootPath,
    kind: "git",
    ...overrides,
  };
}

function sources(
  projects: ProjectListEntry[],
  workspaces: WorkspacePageSource,
): ScanSources {
  return {
    projects: {
      async list() {
        return { projects };
      },
    },
    workspaces,
  };
}

describe("read-only Git process", () => {
  it("applies the fixed environment and process limits", async () => {
    let captured: Parameters<GitProcessExecutor> | null = null;
    const executor: GitProcessExecutor = async (...args) => {
      captured = args;
      return { stdout: "", stderr: "" };
    };
    const git = createGitRunner(executor);

    await git("C:\\repository", ["status", "--porcelain=v2", "--branch", "-z"]);

    expect(captured).not.toBeNull();
    const [file, args, options] = captured!;
    expect(file).toBe("git");
    expect(args).toEqual(["status", "--porcelain=v2", "--branch", "-z"]);
    expect(options).toMatchObject({
      cwd: "C:\\repository",
      encoding: "utf8",
      timeout: 15_000,
      maxBuffer: 4 * 1024 * 1024,
      windowsHide: true,
      shell: false,
    });
    expect(options.env.GIT_OPTIONAL_LOCKS).toBe("0");
    expect(options.env.LC_ALL).toBe("C");
  });

  it("blocks commands outside the read-only allowlist", () => {
    expect(() => assertReadOnlyGitArgs(["branch", "-d", "old-branch"])).toThrow(
      "Blocked non-read-only Git command",
    );
    expect(() => assertReadOnlyGitArgs(["worktree", "prune"])).toThrow(
      "Blocked non-read-only Git command",
    );
    expect(() => assertReadOnlyGitArgs(["fetch"])).toThrow(
      "Blocked non-read-only Git command",
    );
  });
});

describe("Git output parsing", () => {
  it("distinguishes tracked, gone, and local-only upstreams", () => {
    const output = [
      "refs/heads/main\0main\0refs/remotes/origin/main\0\0",
      "\nrefs/heads/gone\0gone\0refs/remotes/origin/gone\0[gone]\0",
      "\nrefs/heads/local\0local\0\0\0\n",
    ].join("");

    expect(parseBranches(output)).toEqual([
      {
        ref: "refs/heads/main",
        name: "main",
        upstreamRef: "refs/remotes/origin/main",
        upstreamState: "tracked",
      },
      {
        ref: "refs/heads/gone",
        name: "gone",
        upstreamRef: "refs/remotes/origin/gone",
        upstreamState: "gone",
      },
      {
        ref: "refs/heads/local",
        name: "local",
        upstreamRef: null,
        upstreamState: "local_only",
      },
    ]);
  });

  it("keeps worktree paths associated with checked-out refs", () => {
    const output = [
      "worktree C:/repo one\0HEAD abc\0branch refs/heads/main\0\0",
      "worktree C:/한글 worktree\0HEAD def\0branch refs/heads/feature\0\0",
    ].join("");

    expect(parseWorktreeBranches(output)).toEqual(
      new Map([
        ["refs/heads/main", ["C:/repo one"]],
        ["refs/heads/feature", ["C:/한글 worktree"]],
      ]),
    );
  });

  it("parses detached and dirty workspace status", () => {
    const entry = workspace("detached", "C:/repo");
    const status = [
      "# branch.oid 0123456789abcdef\0",
      "# branch.head (detached)\0",
      "? untracked file.txt\0",
    ].join("");

    expect(parseWorkspaceStatus(entry, status)).toMatchObject({
      currentBranch: null,
      headOid: "0123456789abcdef",
      detached: true,
      isDirty: true,
    });
  });
});

describe("base ref resolution", () => {
  it("prefers a valid origin/HEAD symbolic target", async () => {
    const git: GitRunner = async (_cwd, args) => {
      if (args[0] === "symbolic-ref") {
        return { stdout: "refs/remotes/origin/release/v1\n", stderr: "" };
      }
      if (args.join(" ").includes("refs/remotes/origin/release/v1^{commit}")) {
        return { stdout: "abc\n", stderr: "" };
      }
      throw new Error("missing ref");
    };

    await expect(resolveBaseReference("C:/repo", git)).resolves.toEqual({
      state: "resolved",
      ref: "refs/remotes/origin/release/v1",
      localBranchRef: "refs/heads/release/v1",
      source: "origin_head",
    });
  });

  it("falls back through master and fails closed when no candidate exists", async () => {
    const masterOnly: GitRunner = async (_cwd, args) => {
      if (args.join(" ").includes("refs/heads/master^{commit}")) {
        return { stdout: "abc\n", stderr: "" };
      }
      throw new Error("missing ref");
    };
    const noRefs: GitRunner = async () => {
      throw new Error("missing ref");
    };

    await expect(resolveBaseReference("C:/repo", masterOnly)).resolves.toMatchObject({
      state: "resolved",
      ref: "refs/heads/master",
      source: "local_master",
    });
    await expect(resolveBaseReference("C:/repo", noRefs)).resolves.toEqual({
      state: "unknown",
      ref: null,
      localBranchRef: null,
      source: null,
    });
  });
});

describe("Project and Workspace discovery", () => {
  it("stops with an error if a later page fails", async () => {
    const workspaceSource: WorkspacePageSource = {
      list: vi.fn(async ({ cursor }) => {
        if (!cursor) {
          return {
            entries: [],
            pageInfo: { hasMore: true, nextCursor: "page-2" },
          };
        }
        throw new Error("page unavailable");
      }),
    };

    await expect(scanBranchGarden(sources([], workspaceSource))).rejects.toThrow("page unavailable");
    expect(workspaceSource.list).toHaveBeenCalledTimes(2);
  });

  it("fetches the complete Project list once and excludes non-Git Projects", async () => {
    const create = vi.fn(() => {
      throw new Error("create must not be called");
    });
    const archive = vi.fn(() => {
      throw new Error("archive must not be called");
    });
    const projectList = vi.fn(async () => ({
      projects: [
        project("docs", "C:/docs", { kind: "directory" }),
        project("other", "C:/other", { kind: "non_git" }),
      ],
    }));
    const workspaceList = vi.fn(async () => ({
      entries: [workspace("directory", "C:/docs", {
        projectId: "docs",
        projectKind: "directory",
      })],
      pageInfo: { hasMore: false, nextCursor: null },
    }));
    const scanSources = {
      projects: { list: projectList, create },
      workspaces: {
        list: workspaceList,
        archive,
      },
    };

    const result = await scanBranchGarden(scanSources);

    expect(result.skippedNonGitProjectCount).toBe(2);
    expect(result.summary.projectCount).toBe(0);
    expect(result.repositories).toEqual([]);
    expect(projectList).toHaveBeenCalledTimes(1);
    expect(workspaceList).toHaveBeenCalledTimes(1);
    expect(create).not.toHaveBeenCalled();
    expect(archive).not.toHaveBeenCalled();
  });

  it("recovers an active Workspace whose Project is absent from the Project snapshot", async () => {
    const workspaceSource: WorkspacePageSource = {
      list: vi.fn(async () => ({
        entries: [workspace("directory", "C:/docs", {
          projectId: "docs",
          projectKind: "directory",
        })],
        pageInfo: { hasMore: false, nextCursor: null },
      })),
    };

    const result = await scanBranchGarden(sources([], workspaceSource));

    expect(result.skippedNonGitProjectCount).toBe(1);
    expect(result.repositories).toEqual([]);
    expect(result.warnings).toContain(
      "Fixture Repository: Project 목록에 없어 활성 Workspace 정보로 복구했습니다.",
    );
  });
});

describe("real Git fixture", () => {
  it("scans a registered Git Project with no active Workspace from its root", async () => {
    const root = createTemporaryRoot();
    const repository = path.join(root, "inactive project");
    mkdirSync(repository);
    fixtureGit(repository, ["init", "-b", "main"]);
    fixtureGit(repository, ["config", "user.name", "Branch Garden Test"]);
    fixtureGit(repository, ["config", "user.email", "branch-garden@example.invalid"]);
    writeFileSync(path.join(repository, "README.md"), "inactive\n", "utf8");
    fixtureGit(repository, ["add", "README.md"]);
    fixtureGit(repository, ["commit", "-m", "initial"]);

    const refsBefore = fixtureGit(repository, ["show-ref"]);
    const statusBefore = fixtureGit(repository, ["status", "--porcelain=v1", "-z"]);
    const workspaceSource: WorkspacePageSource = {
      async list() {
        return {
          entries: [],
          pageInfo: { hasMore: false, nextCursor: null },
        };
      },
    };

    const result = await scanBranchGarden(
      sources(
        [project("inactive", repository, { displayName: "Inactive Project" })],
        workspaceSource,
      ),
      { now: () => new Date("2026-08-27T00:00:00.000Z") },
    );

    expect(BranchGardenScanResultSchema.safeParse(result).success).toBe(true);
    expect(result.summary).toMatchObject({
      projectCount: 1,
      workspaceCount: 0,
      repositoryCount: 1,
      branchCount: 1,
    });
    expect(result.repositories[0]).toMatchObject({
      name: "Inactive Project",
      rootPath: repository,
      workspaces: [],
      error: null,
    });
    expect(fixtureGit(repository, ["show-ref"])).toBe(refsBefore);
    expect(fixtureGit(repository, ["status", "--porcelain=v1", "-z"])).toBe(statusBefore);
  });

  it("groups worktrees once, preserves Workspaces, and does not change Git state", async () => {
    const root = createTemporaryRoot();
    const repository = path.join(root, "repo with spaces");
    const linkedWorktree = path.join(root, "연결된 worktree");
    const detachedWorktree = path.join(root, "detached worktree");
    const missingRepository = path.join(root, "missing repository");
    mkdirSync(repository);

    fixtureGit(repository, ["init", "-b", "main"]);
    fixtureGit(repository, ["config", "user.name", "Branch Garden Test"]);
    fixtureGit(repository, ["config", "user.email", "branch-garden@example.invalid"]);
    writeFileSync(path.join(repository, "README.md"), "main\n", "utf8");
    fixtureGit(repository, ["add", "README.md"]);
    fixtureGit(repository, ["commit", "-m", "initial"]);

    fixtureGit(repository, ["checkout", "-b", "merged-local"]);
    writeFileSync(path.join(repository, "merged.txt"), "merged\n", "utf8");
    fixtureGit(repository, ["add", "merged.txt"]);
    fixtureGit(repository, ["commit", "-m", "merged branch"]);
    fixtureGit(repository, ["checkout", "main"]);
    fixtureGit(repository, ["merge", "--no-ff", "-m", "merge local branch", "merged-local"]);

    fixtureGit(repository, ["checkout", "-b", "unmerged-local"]);
    writeFileSync(path.join(repository, "unmerged.txt"), "unmerged\n", "utf8");
    fixtureGit(repository, ["add", "unmerged.txt"]);
    fixtureGit(repository, ["commit", "-m", "unmerged branch"]);
    fixtureGit(repository, ["checkout", "main"]);
    fixtureGit(repository, ["worktree", "add", linkedWorktree, "unmerged-local"]);
    fixtureGit(repository, ["worktree", "add", "--detach", detachedWorktree, "HEAD"]);
    writeFileSync(path.join(repository, "dirty.txt"), "dirty\n", "utf8");

    const refsBefore = fixtureGit(repository, ["show-ref"]);
    const statusBefore = fixtureGit(repository, ["status", "--porcelain=v1", "-z"]);
    const entries = [
      workspace("main", repository, { projectId: "repo", title: "Main Workspace" }),
      workspace("docs", root, { projectId: "docs", projectKind: "non_git" }),
      workspace("linked", linkedWorktree, { projectId: "repo", title: "Feature Workspace" }),
      workspace("detached", detachedWorktree, {
        projectId: "repo",
        title: "Detached Workspace",
      }),
      workspace("missing", missingRepository, {
        projectId: "missing",
        projectRootPath: missingRepository,
        title: "Missing Workspace",
      }),
    ];
    const workspaceSource: WorkspacePageSource = {
      async list({ cursor }) {
        return cursor
          ? {
              entries: entries.slice(2),
              pageInfo: { hasMore: false, nextCursor: null },
            }
          : {
              entries: entries.slice(0, 2),
              pageInfo: { hasMore: true, nextCursor: "page-2" },
            };
      },
    };
    const actualGit = createGitRunner();
    let worktreeListCount = 0;
    const countedGit: GitRunner = async (cwd, args) => {
      if (args[0] === "worktree" && args[1] === "list") {
        worktreeListCount += 1;
      }
      return actualGit(cwd, args);
    };

    const result = await scanBranchGarden(
      sources(
        [
          project("repo", repository),
          project("repo-alias", repository),
          project("docs", root, { kind: "non_git" }),
          project("missing", missingRepository),
        ],
        workspaceSource,
      ),
      {
        git: countedGit,
        now: () => new Date("2026-08-27T00:00:00.000Z"),
      },
    );

    expect(BranchGardenScanResultSchema.safeParse(result).success).toBe(true);
    expect(result.scannedAt).toBe("2026-08-27T00:00:00.000Z");
    expect(result.skippedNonGitProjectCount).toBe(1);
    expect(result.summary.projectCount).toBe(3);
    expect(result.summary.workspaceCount).toBe(4);
    expect(result.summary.repositoryCount).toBe(2);
    expect(worktreeListCount).toBe(1);
    expect(result.repositories[0].commonDirectory).not.toBeNull();

    const scanned = result.repositories.find((item) => item.commonDirectory !== null)!;
    const failed = result.repositories.find((item) => item.commonDirectory === null)!;
    expect(scanned.workspaces).toHaveLength(3);
    expect(scanned.base).toMatchObject({
      state: "resolved",
      ref: "refs/heads/main",
      source: "local_main",
    });
    expect(failed.error).toContain("Git 저장소 판별 실패");
    expect(result.summary.warningCount).toBeGreaterThan(0);

    expect(scanned.branches.find((branch) => branch.name === "main")).toMatchObject({
      category: "keep",
      isDefault: true,
      checkoutState: "checked_out",
    });
    expect(scanned.branches.find((branch) => branch.name === "merged-local")).toMatchObject({
      category: "cleanup_candidate",
      mergeState: "merged",
      upstreamState: "local_only",
      checkoutState: "not_checked_out",
    });
    expect(scanned.branches.find((branch) => branch.name === "unmerged-local")).toMatchObject({
      category: "keep",
      mergeState: "unmerged",
      checkoutState: "checked_out",
    });
    expect(scanned.workspaces.find((item) => item.id === "main")).toMatchObject({
      currentBranch: "main",
      isDirty: true,
      detached: false,
    });
    expect(scanned.workspaces.find((item) => item.id === "detached")).toMatchObject({
      currentBranch: null,
      isDirty: false,
      detached: true,
    });

    expect(fixtureGit(repository, ["show-ref"])).toBe(refsBefore);
    expect(fixtureGit(repository, ["status", "--porcelain=v1", "-z"])).toBe(statusBefore);
  });
});
