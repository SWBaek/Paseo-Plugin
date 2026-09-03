import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const DEFAULT_EXCLUDED_DIRECTORIES = new Set([
  ".cache",
  ".git",
  ".npm",
  ".pnpm-store",
  ".turbo",
  ".venv",
  "__pycache__",
  "coverage",
  "node_modules",
  "venv",
]);

const DEFAULT_EXCLUDED_FILES = new Set([".ds_store", "thumbs.db"]);
const DEFAULT_EXCLUDED_SUFFIXES = [".log", ".temp", ".tmp"];

interface GitCommandError extends Error {
  code?: number | string;
}

const GIT_REPOSITORY_CHECK = ["rev-parse", "--is-inside-work-tree"] as const;
const GIT_ARCHIVE_LIST = [
  "ls-files",
  "-z",
  "--cached",
  "--others",
  "--exclude-standard",
  "--",
  ".",
] as const;

function sameCommand(args: readonly string[], allowed: readonly string[]): boolean {
  return args.length === allowed.length && args.every((arg, index) => arg === allowed[index]);
}

export function assertReadOnlyArchiveGitCommand(args: readonly string[]): void {
  if (sameCommand(args, GIT_REPOSITORY_CHECK) || sameCommand(args, GIT_ARCHIVE_LIST)) return;
  throw new Error(`Blocked non-read-only Git command: ${args.join(" ")}`);
}

async function runArchiveGitCommand(
  directory: string,
  args: readonly string[],
  maxBuffer: number,
) {
  assertReadOnlyArchiveGitCommand(args);
  return execFileAsync("git", ["-C", directory, ...args], {
    timeout: args[0] === "ls-files" ? 10_000 : 5_000,
    windowsHide: true,
    maxBuffer,
  });
}

export function isDefaultArchiveExcluded(
  relativeSegments: readonly string[],
  kind: "directory" | "file",
): boolean {
  const normalized = relativeSegments.map((segment) => segment.toLocaleLowerCase("en-US"));
  if (normalized.some((segment) => DEFAULT_EXCLUDED_DIRECTORIES.has(segment))) return true;
  if (normalized.some((segment, index) => segment === "cache" && normalized[index - 1] === ".yarn")) {
    return true;
  }
  if (kind === "directory") return false;
  const name = normalized.at(-1) ?? "";
  return (
    DEFAULT_EXCLUDED_FILES.has(name) ||
    DEFAULT_EXCLUDED_SUFFIXES.some((suffix) => name.endsWith(suffix))
  );
}

export async function listGitArchiveFiles(directory: string): Promise<string[] | null> {
  try {
    const repository = await runArchiveGitCommand(
      directory,
      GIT_REPOSITORY_CHECK,
      1024 * 1024,
    );
    if (repository.stdout.trim() !== "true") return null;
  } catch (error) {
    if ((error as GitCommandError).code === 128) return null;
    throw new Error("Git ignore 규칙을 확인할 수 없습니다.");
  }

  try {
    const result = await runArchiveGitCommand(
      directory,
      GIT_ARCHIVE_LIST,
      8 * 1024 * 1024,
    );
    return result.stdout.split("\0").filter((name) => name.length > 0);
  } catch {
    throw new Error("Git ignore 규칙을 적용할 수 없습니다.");
  }
}
