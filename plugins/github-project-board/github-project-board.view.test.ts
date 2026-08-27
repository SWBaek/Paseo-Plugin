import { describe, expect, it } from "vitest";
import type { GithubIssueCard, GithubProjectColumn } from "./github-project-board.shared";
import {
  countColumnIssues,
  filterProjectColumns,
  issueMatchesQuery,
  issueMatchesRepository,
} from "./github-project-board.view";

const issue: GithubIssueCard = {
  id: "item-7",
  number: 7,
  repository: "SWBaek/Paseo-Plugin",
  title: "GitHub Project 칸반 구현",
  url: "https://github.com/SWBaek/Paseo-Plugin/issues/7",
  labels: ["enhancement", "plugin:github-project-board"],
  assignees: ["SWBaek"],
  priority: "P1",
  size: "M",
};

describe("board search", () => {
  it.each(["칸반", "#7", "Paseo-Plugin", "enhancement", "swbaek"])(
    "matches %s against a supported issue field",
    (query) => {
      expect(issueMatchesQuery(issue, query)).toBe(true);
    },
  );

  it("does not search fields that are not part of the agreed filter", () => {
    expect(issueMatchesQuery(issue, "P1")).toBe(false);
    expect(issueMatchesQuery(issue, "missing")).toBe(false);
  });

  it("preserves columns while filtering cards and counts visible results", () => {
    const columns: GithubProjectColumn[] = [
      { id: "inbox", name: "Inbox", issues: [issue] },
      { id: "done", name: "Done", issues: [{ ...issue, id: "item-8", number: 8, title: "Other" }] },
    ];
    const filtered = filterProjectColumns(columns, "#7");

    expect(filtered.map((column) => column.name)).toEqual(["Inbox", "Done"]);
    expect(filtered[0].issues).toEqual([issue]);
    expect(filtered[1].issues).toEqual([]);
    expect(countColumnIssues(filtered)).toBe(1);
  });
});

describe("repository filter", () => {
  it("matches a repository by its short name regardless of owner or case", () => {
    const repositoryIssue = { ...issue, repository: "SWBaek/doc-extract-review" };

    expect(issueMatchesRepository(repositoryIssue, "doc-extract-review")).toBe(true);
    expect(issueMatchesRepository(repositoryIssue, "DOC-EXTRACT-REVIEW")).toBe(true);
    expect(issueMatchesRepository(repositoryIssue, "sdoc-editor")).toBe(false);
    expect(issueMatchesRepository(repositoryIssue, null)).toBe(true);
  });

  it("combines the selected repository with search while preserving columns", () => {
    const docIssue = {
      ...issue,
      id: "doc-7",
      repository: "SWBaek/doc-extract-review",
      title: "검토 화면 구현",
    };
    const sdocIssue = {
      ...issue,
      id: "sdoc-8",
      number: 8,
      repository: "SWBaek/sdoc-editor",
      title: "검토 화면 구현",
    };
    const columns: GithubProjectColumn[] = [
      { id: "inbox", name: "Inbox", issues: [docIssue, sdocIssue] },
      { id: "done", name: "Done", issues: [] },
    ];

    const filtered = filterProjectColumns(columns, "검토", "doc-extract-review");

    expect(filtered.map((column) => column.name)).toEqual(["Inbox", "Done"]);
    expect(filtered[0].issues).toEqual([docIssue]);
    expect(filtered[1].issues).toEqual([]);
    expect(countColumnIssues(filtered)).toBe(1);
  });
});
