import { describe, expect, it } from "vitest";
import { formatSkillDraft, selectSessionSkills } from "./skill-catalog";

describe("selectSessionSkills", () => {
  it("keeps only kind=skill when the provider marks skills", () => {
    const catalog = selectSessionSkills({
      commands: [
        {
          name: "/compact",
          description: "Compact context",
          argumentHint: "",
          kind: "command",
        },
        {
          name: "github-branch-cleanup",
          description: "Remove stale branches",
          argumentHint: "branch names",
          kind: "skill",
        },
        {
          name: "orphan",
          description: "No kind",
          argumentHint: "",
        },
      ],
      error: null,
    });

    expect(catalog).toEqual({
      skills: [
        {
          name: "github-branch-cleanup",
          description: "Remove stale branches",
          argumentHint: "branch names",
        },
      ],
      error: null,
    });
  });

  it("falls back to non-builtin commands when no item is marked as a skill", () => {
    const catalog = selectSessionSkills({
      commands: [
        {
          name: "compact",
          description: "Compress conversation history",
          argumentHint: "",
          kind: "command",
        },
        {
          name: "hooks-list",
          description: "Show hooks",
          argumentHint: "",
          kind: "command",
        },
        {
          name: "github-branch-cleanup",
          description: "Remove stale branches",
          argumentHint: "",
          kind: "command",
        },
        {
          name: "paseo-plugin",
          description: "Build plugins",
          argumentHint: "",
          kind: "command",
        },
      ],
      error: null,
    });

    expect(catalog.skills.map((skill) => skill.name)).toEqual([
      "github-branch-cleanup",
      "paseo-plugin",
    ]);
  });

  it("preserves provider errors", () => {
    expect(
      selectSessionSkills({
        commands: [
          {
            name: "github-branch-cleanup",
            description: "Remove stale branches",
            argumentHint: "",
            kind: "command",
          },
        ],
        error: "provider cannot list commands",
      }),
    ).toMatchObject({
      skills: [{ name: "github-branch-cleanup" }],
      error: "provider cannot list commands",
    });
  });
});

describe("formatSkillDraft", () => {
  it("copies the skill name alone when the user text is empty", () => {
    expect(formatSkillDraft({ name: "github-branch-cleanup" }, "  ")).toBe(
      "github-branch-cleanup",
    );
  });

  it("places user text after the skill name", () => {
    expect(
      formatSkillDraft({ name: "github-branch-cleanup" }, " stale local branches "),
    ).toBe("github-branch-cleanup\n\nstale local branches");
  });
});
