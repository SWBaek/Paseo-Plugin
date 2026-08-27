import type { RepositorySnapshot } from "./branch-garden.shared";

export type RepositoryFilter = "all" | "cleanup_candidate" | "review";

export function repositoryMatchesFilter(
  repository: RepositorySnapshot,
  filter: RepositoryFilter,
): boolean {
  if (filter === "cleanup_candidate") {
    return repository.cleanupCandidateCount > 0;
  }
  if (filter === "review") {
    return repository.reviewCount > 0;
  }
  return true;
}

export function filterRepositories(
  repositories: readonly RepositorySnapshot[],
  filter: RepositoryFilter,
): RepositorySnapshot[] {
  return repositories.filter((repository) => repositoryMatchesFilter(repository, filter));
}
