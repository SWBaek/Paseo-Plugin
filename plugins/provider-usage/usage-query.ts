import type { QueryClient } from "@tanstack/react-query";
import type { ProviderUsageSnapshot } from "./provider-usage.shared";

export const USAGE_QUERY_KEY = ["provider-usage", "snapshot"] as const;
export const USAGE_STALE_TIME_MS = 60_000;
export const USAGE_REFETCH_INTERVAL_MS = 120_000;

let queryClient: QueryClient | undefined;

export function bindUsageQueryClient(client: QueryClient): void {
  queryClient = client;
}

export function usageQueryOptions(queryFn: () => Promise<ProviderUsageSnapshot>) {
  return {
    queryKey: USAGE_QUERY_KEY,
    queryFn,
    staleTime: USAGE_STALE_TIME_MS,
    refetchInterval: USAGE_REFETCH_INTERVAL_MS,
  };
}

export async function refreshUsageSnapshot(): Promise<void> {
  if (!queryClient) return;
  await queryClient.refetchQueries({ queryKey: USAGE_QUERY_KEY });
}
