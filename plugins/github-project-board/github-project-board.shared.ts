import { defineRpc } from "@getpaseo/plugin/server";
import { z } from "zod";

export const GithubIssueCardSchema = z.object({
  id: z.string(),
  number: z.number().int().nonnegative(),
  repository: z.string(),
  title: z.string(),
  url: z.string().url(),
  labels: z.array(z.string()),
  assignees: z.array(z.string()),
  priority: z.string().nullable(),
  size: z.string().nullable(),
});

export const GithubProjectColumnSchema = z.object({
  id: z.string(),
  name: z.string(),
  issues: z.array(GithubIssueCardSchema),
});

export const GithubProjectSummarySchema = z.object({
  owner: z.string(),
  number: z.number().int().positive(),
  title: z.string(),
  url: z.string().url(),
  itemCount: z.number().int().nonnegative(),
});

export const GithubProjectListResultSchema = z.object({
  projects: z.array(GithubProjectSummarySchema),
});

export const GithubProjectBoardScanResultSchema = z.object({
  scannedAt: z.string(),
  project: z.object({
    owner: z.string(),
    number: z.number().int().positive(),
    title: z.string(),
    url: z.string().url(),
  }),
  columns: z.array(GithubProjectColumnSchema),
  issueCount: z.number().int().nonnegative(),
  excludedItemCount: z.number().int().nonnegative(),
  warnings: z.array(z.string()),
});

export const githubProjectBoardScan = defineRpc({
  name: "github-project-board.scan",
  input: z.object({ number: z.number().int().positive() }),
  output: GithubProjectBoardScanResultSchema,
});

export const githubProjectBoardList = defineRpc({
  name: "github-project-board.list",
  input: z.object({}),
  output: GithubProjectListResultSchema,
});

export type GithubIssueCard = z.infer<typeof GithubIssueCardSchema>;
export type GithubProjectColumn = z.infer<typeof GithubProjectColumnSchema>;
export type GithubProjectSummary = z.infer<typeof GithubProjectSummarySchema>;
export type GithubProjectListResult = z.infer<typeof GithubProjectListResultSchema>;
export type GithubProjectBoardScanResult = z.infer<
  typeof GithubProjectBoardScanResultSchema
>;
