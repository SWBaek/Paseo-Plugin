import { describe, expect, it, vi } from "vitest";
import { GithubProjectBoardScanResultSchema } from "./github-project-board.shared";
import {
  GH_PROJECT_FIELD_LIST_ARGS,
  GH_PROJECT_ITEM_LIST_ARGS,
  GH_PROJECT_VIEW_ARGS,
  assertReadOnlyGhArgs,
  createGhRunner,
  githubCliErrorMessage,
  scanGithubProject,
  type GhProcessExecutor,
  type GhRunner,
} from "./github-project-board.server";

const VIEW = {
  title: "Paseo Plugins",
  url: "https://github.com/users/SWBaek/projects/1",
  number: 1,
  owner: { login: "SWBaek" },
  items: { totalCount: 1 },
};
const FIELDS = {
  fields: [
    {
      id: "status",
      name: "Status",
      options: [
        { id: "inbox", name: "Inbox" },
        { id: "done", name: "Done" },
      ],
    },
  ],
};
const ITEMS = {
  totalCount: 1,
  items: [
    {
      id: "item-1",
      status: "Done",
      labels: ["idea"],
      assignees: ["SWBaek"],
      content: {
        number: 6,
        repository: "SWBaek/Paseo-Plugin",
        title: "Board idea",
        type: "Issue",
        url: "https://github.com/SWBaek/Paseo-Plugin/issues/6",
      },
    },
  ],
};

function fixtureRunner(overrides: Partial<Record<string, string>> = {}): GhRunner {
  return vi.fn(async (args) => {
    const command = args.slice(0, 2).join(" ");
    const values: Record<string, string> = {
      "project view": JSON.stringify(VIEW),
      "project field-list": JSON.stringify(FIELDS),
      "project item-list": JSON.stringify(ITEMS),
      ...overrides,
    };
    return { stdout: values[command], stderr: "" };
  });
}

describe("read-only GitHub CLI process", () => {
  it("applies fixed arguments, environment, and process limits", async () => {
    let captured: Parameters<GhProcessExecutor> | null = null;
    const executor: GhProcessExecutor = async (...args) => {
      captured = args;
      return { stdout: "{}", stderr: "" };
    };
    const gh = createGhRunner(executor);

    await gh(GH_PROJECT_ITEM_LIST_ARGS);

    const [file, args, options] = captured!;
    expect(file).toBe("gh");
    expect(args).toEqual(GH_PROJECT_ITEM_LIST_ARGS);
    expect(options).toMatchObject({
      encoding: "utf8",
      timeout: 30_000,
      maxBuffer: 8 * 1024 * 1024,
      windowsHide: true,
      shell: false,
    });
    expect(options.env.GH_PAGER).toBe("cat");
    expect(options.env.NO_COLOR).toBe("1");
  });

  it("blocks commands outside the exact read-only allowlist", () => {
    expect(() => assertReadOnlyGhArgs(GH_PROJECT_VIEW_ARGS)).not.toThrow();
    expect(() => assertReadOnlyGhArgs(GH_PROJECT_FIELD_LIST_ARGS)).not.toThrow();
    expect(() => assertReadOnlyGhArgs(GH_PROJECT_ITEM_LIST_ARGS)).not.toThrow();
    expect(() => assertReadOnlyGhArgs(["project", "item-edit", "--id", "danger"])).toThrow(
      "Blocked non-read-only GitHub CLI command",
    );
    expect(() => assertReadOnlyGhArgs([...GH_PROJECT_ITEM_LIST_ARGS, "--query", "secret"])).toThrow();
  });
});

describe("GitHub CLI errors", () => {
  it("returns actionable messages for missing CLI, login, scope, and project", () => {
    expect(githubCliErrorMessage(Object.assign(new Error("spawn gh ENOENT"), { code: "ENOENT" }))).toContain("설치");
    expect(githubCliErrorMessage(new Error("not logged into any GitHub hosts; run gh auth login"))).toContain("gh auth login");
    expect(githubCliErrorMessage(new Error("missing required scopes [project]"))).toContain("gh auth refresh -s project");
    expect(githubCliErrorMessage(new Error("Could not resolve to a ProjectV2"))).toContain("Project #1");
  });

  it("redacts tokens from fallback errors", () => {
    expect(githubCliErrorMessage(new Error("request failed with ghp_superSecretValue"))).not.toContain("superSecretValue");
  });

  it("explains when the GitHub CLI output exceeds the buffer", () => {
    const error = Object.assign(new Error("stdout maxBuffer length exceeded"), {
      code: "ERR_CHILD_PROCESS_STDIO_MAXBUFFER",
    });
    expect(githubCliErrorMessage(error)).toContain("허용된 크기를 초과");
  });
});

describe("project scan", () => {
  it("runs the three approved queries and returns schema-valid board data", async () => {
    const gh = fixtureRunner();
    const result = await scanGithubProject({
      gh,
      now: () => new Date("2026-08-28T00:00:00.000Z"),
    });

    expect(gh).toHaveBeenCalledTimes(3);
    expect(gh).toHaveBeenCalledWith(GH_PROJECT_VIEW_ARGS);
    expect(gh).toHaveBeenCalledWith(GH_PROJECT_FIELD_LIST_ARGS);
    expect(gh).toHaveBeenCalledWith(GH_PROJECT_ITEM_LIST_ARGS);
    expect(result.scannedAt).toBe("2026-08-28T00:00:00.000Z");
    expect(result.columns.map((column) => column.name)).toEqual(["Inbox", "Done"]);
    expect(result.columns[1].issues[0]).toMatchObject({ number: 6, title: "Board idea" });
    expect(GithubProjectBoardScanResultSchema.safeParse(result).success).toBe(true);
  });

  it("rejects invalid JSON with the command name", async () => {
    await expect(
      scanGithubProject({ gh: fixtureRunner({ "project item-list": "not-json" }) }),
    ).rejects.toThrow("gh project item-list 명령이 올바른 JSON");
  });

  it("translates process failures without exposing raw execution details", async () => {
    const gh: GhRunner = async () => {
      throw new Error("missing required scopes [project]");
    };

    await expect(scanGithubProject({ gh })).rejects.toThrow("gh auth refresh -s project");
  });
});
