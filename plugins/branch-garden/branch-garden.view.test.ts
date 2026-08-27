import { describe, expect, it } from "vitest";
import type { RepositorySnapshot } from "./branch-garden.shared";
import { filterRepositories, repositoryMatchesFilter } from "./branch-garden.view";

function repository(
  id: string,
  cleanupCandidateCount: number,
  reviewCount: number,
): RepositorySnapshot {
  return {
    id,
    name: id,
    rootPath: `C:/${id}`,
    commonDirectory: `C:/${id}/.git`,
    base: {
      state: "resolved",
      ref: "refs/heads/main",
      localBranchRef: "refs/heads/main",
      source: "local_main",
    },
    workspaces: [],
    branches: [],
    branchCount: cleanupCandidateCount + reviewCount,
    cleanupCandidateCount,
    reviewCount,
    error: null,
    warnings: [],
  };
}

describe("repository filters", () => {
  const cleanup = repository("cleanup", 3, 0);
  const review = repository("review", 0, 2);
  const quiet = repository("quiet", 0, 0);
  const repositories = [cleanup, review, quiet];

  it("matches each focus filter by its repository count", () => {
    expect(repositoryMatchesFilter(cleanup, "cleanup_candidate")).toBe(true);
    expect(repositoryMatchesFilter(review, "cleanup_candidate")).toBe(false);
    expect(repositoryMatchesFilter(review, "review")).toBe(true);
    expect(repositoryMatchesFilter(quiet, "review")).toBe(false);
  });

  it("keeps all repositories for the default filter", () => {
    expect(filterRepositories(repositories, "all")).toEqual(repositories);
  });

  it("returns only repositories relevant to the selected focus", () => {
    expect(filterRepositories(repositories, "cleanup_candidate")).toEqual([cleanup]);
    expect(filterRepositories(repositories, "review")).toEqual([review]);
  });
});
