import type {
  GithubIssueCard,
  GithubProjectBoardScanResult,
  GithubProjectColumn,
} from "./github-project-board.shared";

export interface RawProjectMetadata {
  owner: string;
  number: number;
  title: string;
  url: string;
  totalItemCount: number;
}

export interface RawProjectField {
  id: string;
  name: string;
  options: ReadonlyArray<{ id: string; name: string }>;
}

export interface NormalizeBoardInput {
  project: RawProjectMetadata;
  fields: readonly RawProjectField[];
  items: readonly Record<string, unknown>[];
  reportedItemCount: number;
  scannedAt: string;
}

const UNCLASSIFIED_COLUMN_ID = "unclassified";
const UNCLASSIFIED_COLUMN_NAME = "미분류";

function record(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function string(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function integer(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
}

function stringArray(value: unknown, objectKey: string): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const values = value.flatMap((item) => {
    const direct = string(item);
    if (direct) {
      return [direct];
    }
    const nested = record(item);
    const nestedValue = nested ? string(nested[objectKey]) : null;
    return nestedValue ? [nestedValue] : [];
  });
  return [...new Set(values)];
}

function caseInsensitiveValue(item: Record<string, unknown>, key: string): unknown {
  const match = Object.keys(item).find((candidate) => candidate.toLowerCase() === key.toLowerCase());
  return match ? item[match] : undefined;
}

function repositoryName(content: Record<string, unknown>, item: Record<string, unknown>): string | null {
  const direct = string(content.repository);
  if (direct) {
    return direct;
  }

  const repositoryUrl = string(item.repository);
  if (!repositoryUrl) {
    return null;
  }
  try {
    const parts = new URL(repositoryUrl).pathname.split("/").filter(Boolean);
    return parts.length >= 2 ? `${parts[parts.length - 2]}/${parts[parts.length - 1]}` : null;
  } catch {
    return null;
  }
}

function normalizeIssue(
  item: Record<string, unknown>,
): { issue: GithubIssueCard; status: string | null } | null {
  const content = record(item.content);
  if (!content || string(content.type)?.toLowerCase() !== "issue") {
    return null;
  }

  const number = integer(content.number);
  const title = string(content.title);
  const url = string(content.url);
  const repository = repositoryName(content, item);
  if (number === null || !title || !url || !repository) {
    return null;
  }

  const id = string(item.id) ?? `${repository}#${number}`;
  return {
    status: string(caseInsensitiveValue(item, "status")),
    issue: {
      id,
      number,
      repository,
      title,
      url,
      labels: stringArray(caseInsensitiveValue(item, "labels"), "name"),
      assignees: stringArray(caseInsensitiveValue(item, "assignees"), "login"),
      priority: string(caseInsensitiveValue(item, "priority")),
      size: string(caseInsensitiveValue(item, "size")),
    },
  };
}

function createColumn(id: string, name: string): GithubProjectColumn {
  return { id, name, issues: [] };
}

export function normalizeProjectBoard(input: NormalizeBoardInput): GithubProjectBoardScanResult {
  const warnings: string[] = [];
  const statusField = input.fields.find((field) => field.name.toLowerCase() === "status");
  const knownColumns = statusField?.options.map((option) => createColumn(option.id, option.name)) ?? [];
  const columnsByName = new Map(
    knownColumns.map((column) => [column.name.toLowerCase(), column] as const),
  );
  const unclassified = createColumn(UNCLASSIFIED_COLUMN_ID, UNCLASSIFIED_COLUMN_NAME);
  const extraColumns: GithubProjectColumn[] = [];
  let excludedItemCount = 0;

  if (!statusField) {
    warnings.push("Project에서 Status 필드를 찾지 못해 모든 이슈를 미분류로 표시합니다.");
  }

  for (const item of input.items) {
    const normalized = normalizeIssue(item);
    if (!normalized) {
      excludedItemCount += 1;
      continue;
    }

    if (!statusField || !normalized.status) {
      unclassified.issues.push(normalized.issue);
      continue;
    }

    const key = normalized.status.toLowerCase();
    const known = columnsByName.get(key);
    if (known) {
      known.issues.push(normalized.issue);
      continue;
    }

    let extra = extraColumns.find((column) => column.name.toLowerCase() === key);
    if (!extra) {
      extra = createColumn(`unknown:${normalized.status}`, normalized.status);
      extraColumns.push(extra);
      warnings.push(
        `Status 옵션에 없는 값 '${normalized.status}'을 별도 칼럼으로 표시합니다.`,
      );
    }
    extra.issues.push(normalized.issue);
  }

  if (excludedItemCount > 0) {
    warnings.push(`Issue가 아닌 항목 또는 필수 정보가 없는 항목 ${excludedItemCount}개를 제외했습니다.`);
  }

  const fetchedCount = input.items.length;
  const expectedCount = Math.max(input.project.totalItemCount, input.reportedItemCount);
  if (expectedCount > fetchedCount) {
    warnings.push(
      `Project 항목 ${expectedCount}개 중 ${fetchedCount}개만 조회되어 결과가 일부 생략되었습니다.`,
    );
  }

  const columns = [
    ...(unclassified.issues.length > 0 ? [unclassified] : []),
    ...knownColumns,
    ...extraColumns,
  ];
  const issueCount = columns.reduce((total, column) => total + column.issues.length, 0);

  return {
    scannedAt: input.scannedAt,
    project: {
      owner: input.project.owner,
      number: input.project.number,
      title: input.project.title,
      url: input.project.url,
    },
    columns,
    issueCount,
    excludedItemCount,
    warnings,
  };
}
