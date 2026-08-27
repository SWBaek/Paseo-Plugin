import { describe, expect, it } from "vitest";
import { classifyBranch, type BranchFacts } from "./branch-garden.logic";

const SAFE_FACTS: BranchFacts = {
  isDefault: false,
  checkoutState: "not_checked_out",
  baseResolved: true,
  mergeState: "merged",
  upstreamState: "local_only",
};

describe("classifyBranch", () => {
  it.each([
    [
      "기본 브랜치는 다른 사실을 무시하고 유지한다",
      { ...SAFE_FACTS, isDefault: true, mergeState: "unknown" as const },
      "keep",
      "default_branch",
    ],
    [
      "체크아웃된 브랜치는 유지한다",
      { ...SAFE_FACTS, checkoutState: "checked_out" as const },
      "keep",
      "checked_out",
    ],
    [
      "기본 ref가 없으면 검토가 필요하다",
      { ...SAFE_FACTS, baseResolved: false },
      "review",
      "insufficient_data",
    ],
    [
      "worktree 상태가 불명확하면 검토가 필요하다",
      { ...SAFE_FACTS, checkoutState: "unknown" as const },
      "review",
      "insufficient_data",
    ],
    [
      "병합 상태가 불명확하면 검토가 필요하다",
      { ...SAFE_FACTS, mergeState: "unknown" as const },
      "review",
      "insufficient_data",
    ],
    [
      "upstream 상태가 불명확하면 검토가 필요하다",
      { ...SAFE_FACTS, upstreamState: "unknown" as const },
      "review",
      "insufficient_data",
    ],
    [
      "미병합이며 upstream이 정상인 브랜치는 유지한다",
      { ...SAFE_FACTS, mergeState: "unmerged" as const, upstreamState: "tracked" as const },
      "keep",
      "unmerged_tracked",
    ],
    [
      "미병합이며 upstream이 사라진 브랜치는 검토한다",
      { ...SAFE_FACTS, mergeState: "unmerged" as const, upstreamState: "gone" as const },
      "review",
      "unmerged_orphaned",
    ],
    [
      "미병합 로컬 전용 브랜치는 검토한다",
      { ...SAFE_FACTS, mergeState: "unmerged" as const, upstreamState: "local_only" as const },
      "review",
      "unmerged_orphaned",
    ],
    [
      "병합되었지만 upstream이 정상인 브랜치는 검토한다",
      { ...SAFE_FACTS, upstreamState: "tracked" as const },
      "review",
      "merged_tracked",
    ],
    [
      "병합되고 upstream이 사라진 브랜치만 정리 후보가 된다",
      { ...SAFE_FACTS, upstreamState: "gone" as const },
      "cleanup_candidate",
      "merged_orphaned",
    ],
    [
      "병합된 로컬 전용 브랜치는 정리 후보가 된다",
      SAFE_FACTS,
      "cleanup_candidate",
      "merged_orphaned",
    ],
  ])("%s", (_name, facts, category, reason) => {
    expect(classifyBranch(facts)).toEqual({ category, reason });
  });
});
