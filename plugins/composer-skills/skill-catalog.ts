export interface SessionCommand {
  name: string;
  description: string;
  argumentHint: string;
  kind?: "command" | "skill";
}

export interface SessionSkill {
  name: string;
  description: string;
  argumentHint: string;
}

export interface SkillCatalog {
  skills: SessionSkill[];
  error: string | null;
}

const BUILT_IN_SESSION_COMMANDS = new Set([
  "always-approve",
  "compact",
  "/compact",
  "context",
  "feedback",
  "session-info",
]);

export function selectSessionSkills(result: {
  commands: SessionCommand[];
  error?: string | null;
}): SkillCatalog {
  const providerMarksSkills = result.commands.some((command) => command.kind === "skill");
  return {
    skills: result.commands
      .filter((command) => isSessionSkill(command, providerMarksSkills))
      .map((command) => ({
        name: command.name,
        description: command.description,
        argumentHint: command.argumentHint,
      })),
    error: result.error ?? null,
  };
}

function isSessionSkill(command: SessionCommand, providerMarksSkills: boolean): boolean {
  if (providerMarksSkills) return command.kind === "skill";
  return !isBuiltInSessionCommand(command.name);
}

function isBuiltInSessionCommand(name: string): boolean {
  const normalized = name.trim().replace(/^\//, "");
  return BUILT_IN_SESSION_COMMANDS.has(name) || BUILT_IN_SESSION_COMMANDS.has(normalized) || normalized.startsWith("hooks-");
}

export function formatSkillDraft(
  skill: Pick<SessionSkill, "name">,
  userText: string,
): string {
  const trimmed = userText.trim();
  if (!trimmed) return skill.name;
  return `${skill.name}\n\n${trimmed}`;
}
