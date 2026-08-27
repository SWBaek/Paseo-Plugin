import type {
  GithubIssueCard,
  GithubProjectColumn,
} from "./github-project-board.shared";

export const IMPORTANT_REPOSITORIES = ["doc-extract-review", "sdoc-editor"] as const;

export function issueMatchesRepository(
  issue: GithubIssueCard,
  repository: string | null,
): boolean {
  const normalizedRepository = repository?.trim().toLocaleLowerCase();
  if (!normalizedRepository) {
    return true;
  }

  const issueRepository = issue.repository.trim().toLocaleLowerCase();
  return (
    issueRepository === normalizedRepository ||
    issueRepository.endsWith(`/${normalizedRepository}`)
  );
}

export function issueMatchesQuery(issue: GithubIssueCard, query: string): boolean {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) {
    return true;
  }

  const searchable = [
    issue.title,
    issue.repository,
    String(issue.number),
    `#${issue.number}`,
    ...issue.labels,
    ...issue.assignees,
  ]
    .join("\n")
    .toLocaleLowerCase();
  return searchable.includes(normalizedQuery);
}

export function filterProjectColumns(
  columns: readonly GithubProjectColumn[],
  query: string,
  repository: string | null = null,
): GithubProjectColumn[] {
  return columns.map((column) => ({
    ...column,
    issues: column.issues.filter(
      (issue) => issueMatchesRepository(issue, repository) && issueMatchesQuery(issue, query),
    ),
  }));
}

export function countColumnIssues(columns: readonly GithubProjectColumn[]): number {
  return columns.reduce((total, column) => total + column.issues.length, 0);
}
