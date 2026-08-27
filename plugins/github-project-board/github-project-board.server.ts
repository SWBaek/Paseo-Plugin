import { execFile } from "node:child_process";
import { z } from "zod";
import { normalizeProjectBoard } from "./github-project-board.logic";
import {
  GithubProjectBoardScanResultSchema,
  type GithubProjectBoardScanResult,
} from "./github-project-board.shared";

export const PROJECT_OWNER = "SWBaek";
export const PROJECT_NUMBER = 1;
export const PROJECT_ITEM_LIMIT = 1_000;

const GH_TIMEOUT_MS = 30_000;
const GH_MAX_BUFFER_BYTES = 8 * 1024 * 1024;

export const GH_PROJECT_VIEW_ARGS = [
  "project",
  "view",
  String(PROJECT_NUMBER),
  "--owner",
  PROJECT_OWNER,
  "--format",
  "json",
] as const;

export const GH_PROJECT_FIELD_LIST_ARGS = [
  "project",
  "field-list",
  String(PROJECT_NUMBER),
  "--owner",
  PROJECT_OWNER,
  "--format",
  "json",
  "--limit",
  "100",
] as const;

export const GH_PROJECT_ITEM_LIST_ARGS = [
  "project",
  "item-list",
  String(PROJECT_NUMBER),
  "--owner",
  PROJECT_OWNER,
  "--format",
  "json",
  "--limit",
  String(PROJECT_ITEM_LIMIT),
] as const;

const ALLOWED_COMMANDS: readonly (readonly string[])[] = [
  GH_PROJECT_VIEW_ARGS,
  GH_PROJECT_FIELD_LIST_ARGS,
  GH_PROJECT_ITEM_LIST_ARGS,
];

const ProjectViewSchema = z.object({
  title: z.string(),
  url: z.string().url(),
  number: z.number().int().positive(),
  owner: z.object({ login: z.string() }),
  items: z.object({ totalCount: z.number().int().nonnegative() }).optional(),
});

const ProjectFieldListSchema = z.object({
  fields: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      options: z
        .array(z.object({ id: z.string(), name: z.string() }))
        .optional(),
    }),
  ),
});

const ProjectItemListSchema = z.object({
  items: z.array(z.record(z.string(), z.unknown())),
  totalCount: z.number().int().nonnegative().optional(),
});

export interface GhCommandResult {
  stdout: string;
  stderr: string;
}

export interface GhProcessOptions {
  env: NodeJS.ProcessEnv;
  encoding: "utf8";
  timeout: number;
  maxBuffer: number;
  windowsHide: true;
  shell: false;
}

export type GhProcessExecutor = (
  file: string,
  args: readonly string[],
  options: GhProcessOptions,
) => Promise<GhCommandResult>;

export type GhRunner = (args: readonly string[]) => Promise<GhCommandResult>;

export interface GithubProjectScanOptions {
  gh?: GhRunner;
  now?: () => Date;
}

function executeGhProcess(
  file: string,
  args: readonly string[],
  options: GhProcessOptions,
): Promise<GhCommandResult> {
  return new Promise((resolve, reject) => {
    execFile(file, [...args], options, (error, stdout, stderr) => {
      if (error) {
        Object.assign(error, { stderr });
        reject(error);
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

function argsEqual(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

export function assertReadOnlyGhArgs(args: readonly string[]): void {
  if (!ALLOWED_COMMANDS.some((allowed) => argsEqual(args, allowed))) {
    throw new Error(`Blocked non-read-only GitHub CLI command: gh ${args.join(" ")}`);
  }
}

export function createGhRunner(executor: GhProcessExecutor = executeGhProcess): GhRunner {
  return async (args) => {
    assertReadOnlyGhArgs(args);
    return executor("gh", args, {
      env: {
        ...process.env,
        GH_PAGER: "cat",
        NO_COLOR: "1",
      },
      encoding: "utf8",
      timeout: GH_TIMEOUT_MS,
      maxBuffer: GH_MAX_BUFFER_BYTES,
      windowsHide: true,
      shell: false,
    });
  };
}

interface ProcessError extends Error {
  code?: string | number;
  stderr?: unknown;
}

function redactSensitiveText(value: string): string {
  return value
    .replace(/github_pat_[A-Za-z0-9_]+/gu, "[REDACTED]")
    .replace(/gh[opurs]_[A-Za-z0-9_]+/gu, "[REDACTED]")
    .trim()
    .slice(0, 700);
}

export function githubCliErrorMessage(error: unknown): string {
  const processError = error as Partial<ProcessError>;
  const rawMessage = [
    error instanceof Error ? error.message : String(error),
    typeof processError.stderr === "string" ? processError.stderr : "",
  ]
    .filter(Boolean)
    .join("\n");
  const message = redactSensitiveText(rawMessage);
  const lower = message.toLowerCase();

  if (processError.code === "ENOENT" || lower.includes("spawn gh enoent")) {
    return "GitHub CLI(gh)를 찾지 못했습니다. 선택한 Paseo 호스트에 GitHub CLI를 설치해 주세요.";
  }
  if (
    lower.includes("not logged into any github hosts") ||
    lower.includes("authentication required") ||
    lower.includes("gh auth login") ||
    lower.includes("bad credentials")
  ) {
    return "GitHub CLI 로그인이 필요합니다. 선택한 Paseo 호스트에서 `gh auth login`을 실행해 주세요.";
  }
  if (
    lower.includes("project scope") ||
    lower.includes("missing required scopes") ||
    lower.includes("insufficient scope") ||
    lower.includes("resource not accessible by personal access token")
  ) {
    return "GitHub Project 읽기 권한이 없습니다. 선택한 Paseo 호스트에서 `gh auth refresh -s project`를 실행해 주세요.";
  }
  if (
    lower.includes("could not resolve to a projectv2") ||
    lower.includes("project not found") ||
    lower.includes("could not resolve to a user")
  ) {
    return `${PROJECT_OWNER}의 GitHub Project #${PROJECT_NUMBER}에 접근하지 못했습니다. Project 존재 여부와 현재 계정 권한을 확인해 주세요.`;
  }
  if (
    processError.code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER" ||
    lower.includes("stdout maxbuffer length exceeded")
  ) {
    return "GitHub Project 응답이 허용된 크기를 초과했습니다. Project 항목 수를 줄이거나 조회 제한을 조정해 주세요.";
  }

  return message
    ? `GitHub Project 조회에 실패했습니다: ${message}`
    : "GitHub Project 조회에 실패했습니다.";
}

function parseJson<Schema extends z.ZodType>(
  label: string,
  output: string,
  schema: Schema,
): z.output<Schema> {
  let value: unknown;
  try {
    value = JSON.parse(output);
  } catch {
    throw new Error(`${label} 명령이 올바른 JSON을 반환하지 않았습니다.`);
  }

  const result = schema.safeParse(value);
  if (!result.success) {
    throw new Error(`${label} 명령의 JSON 구조가 예상한 형식과 다릅니다.`);
  }
  return result.data;
}

export async function scanGithubProject(
  options: GithubProjectScanOptions = {},
): Promise<GithubProjectBoardScanResult> {
  const gh = options.gh ?? createGhRunner();
  let viewResult: GhCommandResult;
  let fieldResult: GhCommandResult;
  let itemResult: GhCommandResult;

  try {
    [viewResult, fieldResult, itemResult] = await Promise.all([
      gh(GH_PROJECT_VIEW_ARGS),
      gh(GH_PROJECT_FIELD_LIST_ARGS),
      gh(GH_PROJECT_ITEM_LIST_ARGS),
    ]);
  } catch (error) {
    throw new Error(githubCliErrorMessage(error));
  }

  const view = parseJson("gh project view", viewResult.stdout, ProjectViewSchema);
  const fieldList = parseJson(
    "gh project field-list",
    fieldResult.stdout,
    ProjectFieldListSchema,
  );
  const itemList = parseJson(
    "gh project item-list",
    itemResult.stdout,
    ProjectItemListSchema,
  );

  const normalized = normalizeProjectBoard({
    project: {
      owner: view.owner.login,
      number: view.number,
      title: view.title,
      url: view.url,
      totalItemCount: view.items?.totalCount ?? itemList.totalCount ?? itemList.items.length,
    },
    fields: fieldList.fields.map((field) => ({
      id: field.id,
      name: field.name,
      options: field.options ?? [],
    })),
    items: itemList.items,
    reportedItemCount: itemList.totalCount ?? itemList.items.length,
    scannedAt: (options.now ?? (() => new Date()))().toISOString(),
  });
  return GithubProjectBoardScanResultSchema.parse(normalized);
}
