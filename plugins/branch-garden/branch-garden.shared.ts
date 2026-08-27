import { defineRpc } from "@getpaseo/plugin/server";
import { z } from "zod";

export const BranchCategorySchema = z.enum(["keep", "review", "cleanup_candidate"]);
export const MergeStateSchema = z.enum(["merged", "unmerged", "unknown"]);
export const UpstreamStateSchema = z.enum(["tracked", "gone", "local_only", "unknown"]);
export const CheckoutStateSchema = z.enum(["checked_out", "not_checked_out", "unknown"]);
export const BranchReasonSchema = z.enum([
  "default_branch",
  "checked_out",
  "insufficient_data",
  "unmerged_tracked",
  "unmerged_orphaned",
  "merged_tracked",
  "merged_orphaned",
]);
export const BaseSourceSchema = z.enum([
  "origin_head",
  "origin_main",
  "origin_master",
  "local_main",
  "local_master",
]);

export const BaseResolutionSchema = z.object({
  state: z.enum(["resolved", "unknown"]),
  ref: z.string().nullable(),
  localBranchRef: z.string().nullable(),
  source: BaseSourceSchema.nullable(),
});

export const WorkspaceSnapshotSchema = z.object({
  id: z.string(),
  name: z.string(),
  directory: z.string(),
  currentBranch: z.string().nullable(),
  headOid: z.string().nullable(),
  detached: z.boolean(),
  isDirty: z.boolean().nullable(),
  error: z.string().nullable(),
});

export const BranchSnapshotSchema = z.object({
  name: z.string(),
  ref: z.string(),
  category: BranchCategorySchema,
  reason: BranchReasonSchema,
  isDefault: z.boolean(),
  checkoutState: CheckoutStateSchema,
  checkedOutAt: z.array(z.string()),
  mergeState: MergeStateSchema,
  upstreamState: UpstreamStateSchema,
  upstreamRef: z.string().nullable(),
});

export const RepositorySnapshotSchema = z.object({
  id: z.string(),
  name: z.string(),
  rootPath: z.string(),
  commonDirectory: z.string().nullable(),
  base: BaseResolutionSchema,
  workspaces: z.array(WorkspaceSnapshotSchema),
  branches: z.array(BranchSnapshotSchema),
  branchCount: z.number().int().nonnegative(),
  cleanupCandidateCount: z.number().int().nonnegative(),
  reviewCount: z.number().int().nonnegative(),
  error: z.string().nullable(),
  warnings: z.array(z.string()),
});

export const BranchGardenScanResultSchema = z.object({
  scannedAt: z.string(),
  summary: z.object({
    workspaceCount: z.number().int().nonnegative(),
    repositoryCount: z.number().int().nonnegative(),
    branchCount: z.number().int().nonnegative(),
    cleanupCandidateCount: z.number().int().nonnegative(),
    warningCount: z.number().int().nonnegative(),
  }),
  skippedNonGitCount: z.number().int().nonnegative(),
  repositories: z.array(RepositorySnapshotSchema),
  warnings: z.array(z.string()),
});

export const branchGardenScan = defineRpc({
  name: "branch-garden.scan",
  input: z.object({}),
  output: BranchGardenScanResultSchema,
});

export type BranchCategory = z.infer<typeof BranchCategorySchema>;
export type MergeState = z.infer<typeof MergeStateSchema>;
export type UpstreamState = z.infer<typeof UpstreamStateSchema>;
export type CheckoutState = z.infer<typeof CheckoutStateSchema>;
export type BranchReason = z.infer<typeof BranchReasonSchema>;
export type BaseSource = z.infer<typeof BaseSourceSchema>;
export type BaseResolution = z.infer<typeof BaseResolutionSchema>;
export type WorkspaceSnapshot = z.infer<typeof WorkspaceSnapshotSchema>;
export type BranchSnapshot = z.infer<typeof BranchSnapshotSchema>;
export type RepositorySnapshot = z.infer<typeof RepositorySnapshotSchema>;
export type BranchGardenScanResult = z.infer<typeof BranchGardenScanResultSchema>;
