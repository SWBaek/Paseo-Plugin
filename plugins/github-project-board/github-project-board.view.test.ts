import { describe, expect, it } from "vitest";
import type { GithubIssueCard, GithubProjectColumn } from "./github-project-board.shared";
import {
  countColumnIssues,
  filterProjectColumns,
  isNativePluginPlatform,
  issueMatchesQuery,
  selectIssuePage,
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

describe("mobile compatibility layout", () => {
  it("only enables the scroll-free layout on native clients", () => {
    expect(isNativePluginPlatform("ios")).toBe(true);
    expect(isNativePluginPlatform("android")).toBe(true);
    expect(isNativePluginPlatform("web")).toBe(false);
  });

  it("clamps issue pagination without requiring a native scrollable", () => {
    const issues = [
      issue,
      { ...issue, id: "item-8", number: 8, title: "Second" },
    ];

    expect(selectIssuePage(issues, -1)).toMatchObject({ index: 0, issue, total: 2 });
    expect(selectIssuePage(issues, 99)).toMatchObject({
      index: 1,
      issue: issues[1],
      total: 2,
    });
    expect(selectIssuePage([], 3)).toEqual({ index: 0, issue: null, total: 0 });
  });
});
