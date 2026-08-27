import type {
  BranchCategory,
  BranchReason,
  CheckoutState,
  MergeState,
  UpstreamState,
} from "./branch-garden.shared";

export interface BranchFacts {
  isDefault: boolean;
  checkoutState: CheckoutState;
  baseResolved: boolean;
  mergeState: MergeState;
  upstreamState: UpstreamState;
}

export interface BranchClassification {
  category: BranchCategory;
  reason: BranchReason;
}

export function classifyBranch(facts: BranchFacts): BranchClassification {
  if (facts.isDefault) {
    return { category: "keep", reason: "default_branch" };
  }

  if (facts.checkoutState === "checked_out") {
    return { category: "keep", reason: "checked_out" };
  }

  if (
    !facts.baseResolved ||
    facts.checkoutState === "unknown" ||
    facts.mergeState === "unknown" ||
    facts.upstreamState === "unknown"
  ) {
    return { category: "review", reason: "insufficient_data" };
  }

  if (facts.mergeState === "unmerged") {
    return facts.upstreamState === "tracked"
      ? { category: "keep", reason: "unmerged_tracked" }
      : { category: "review", reason: "unmerged_orphaned" };
  }

  if (facts.upstreamState === "tracked") {
    return { category: "review", reason: "merged_tracked" };
  }

  return { category: "cleanup_candidate", reason: "merged_orphaned" };
}
