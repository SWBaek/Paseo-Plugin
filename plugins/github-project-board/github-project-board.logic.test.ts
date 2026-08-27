import { describe, expect, it } from "vitest";
import { normalizeProjectBoard, type NormalizeBoardInput } from "./github-project-board.logic";
import { GithubProjectBoardScanResultSchema } from "./github-project-board.shared";

const STATUS_OPTIONS = [
  { id: "inbox", name: "Inbox" },
  { id: "backlog", name: "Backlog" },
  { id: "ready", name: "Ready" },
  { id: "progress", name: "In progress" },
  { id: "review", name: "In review" },
  { id: "done", name: "Done" },
];

function issue(number: number, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: `item-${number}`,
    assignees: ["SWBaek"],
    labels: ["enhancement"],
    status: "Inbox",
    content: {
      number,
      repository: "SWBaek/Paseo-Plugin",
      title: `Issue ${number}`,
      type: "Issue",
      url: `https://github.com/SWBaek/Paseo-Plugin/issues/${number}`,
    },
    ...overrides,
  };
}

function input(items: Record<string, unknown>[]): NormalizeBoardInput {
  return {
    project: {
      owner: "SWBaek",
      number: 1,
      title: "Paseo Plugins",
      url: "https://github.com/users/SWBaek/projects/1",
      totalItemCount: items.length,
    },
    fields: [{ id: "status", name: "Status", options: STATUS_OPTIONS }],
    items,
    reportedItemCount: items.length,
    scannedAt: "2026-08-28T00:00:00.000Z",
  };
}

describe("Project board normalization", () => {
  it("preserves Status order and places unclassified issues first", () => {
    const pullRequest = {
      id: "pr-1",
      status: "In review",
      content: {
        number: 10,
        repository: "SWBaek/Paseo-Plugin",
        title: "PR",
        type: "PullRequest",
        url: "https://github.com/SWBaek/Paseo-Plugin/pull/10",
      },
    };
    const result = normalizeProjectBoard(input([
      issue(1, { status: undefined }),
      issue(2, { status: "Done", Priority: "P1", Size: "M" }),
      pullRequest,
    ]));

    expect(result.columns.map((column) => column.name)).toEqual([
      "미분류",
      "Inbox",
      "Backlog",
      "Ready",
      "In progress",
      "In review",
      "Done",
    ]);
    expect(result.columns[0].issues.map((card) => card.number)).toEqual([1]);
    expect(result.columns.at(-1)?.issues[0]).toMatchObject({
      number: 2,
      priority: "P1",
      size: "M",
      repository: "SWBaek/Paseo-Plugin",
    });
    expect(result.issueCount).toBe(2);
    expect(result.excludedItemCount).toBe(1);
    expect(result.warnings.join(" ")).toContain("1개를 제외");
    expect(GithubProjectBoardScanResultSchema.safeParse(result).success).toBe(true);
  });

  it("normalizes object-shaped labels and assignees", () => {
    const result = normalizeProjectBoard(input([
      issue(3, {
        labels: [{ name: "bug" }, { name: "bug" }],
        assignees: [{ login: "octocat" }],
      }),
    ]));
    const card = result.columns.find((column) => column.name === "Inbox")!.issues[0];

    expect(card.labels).toEqual(["bug"]);
    expect(card.assignees).toEqual(["octocat"]);
  });

  it("keeps an unexpected Status value visible and reports it", () => {
    const result = normalizeProjectBoard(input([issue(4, { status: "Paused" })]));

    expect(result.columns.at(-1)).toMatchObject({ name: "Paused" });
    expect(result.columns.at(-1)?.issues[0].number).toBe(4);
    expect(result.warnings.join(" ")).toContain("Status 옵션에 없는 값 'Paused'");
  });

  it("falls back to the unclassified column when Status is missing", () => {
    const value = input([issue(5, { status: "Ready" })]);
    value.fields = [];
    const result = normalizeProjectBoard(value);

    expect(result.columns).toHaveLength(1);
    expect(result.columns[0].name).toBe("미분류");
    expect(result.warnings.join(" ")).toContain("Status 필드를 찾지 못해");
  });

  it("warns when the project reports more items than were fetched", () => {
    const value = input([issue(6)]);
    value.project.totalItemCount = 1001;
    value.reportedItemCount = 1001;
    const result = normalizeProjectBoard(value);

    expect(result.warnings.join(" ")).toContain("1001개 중 1개만 조회");
  });
});
