import type { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import {
  USAGE_QUERY_KEY,
  USAGE_REFETCH_INTERVAL_MS,
  bindUsageQueryClient,
  refreshUsageSnapshot,
  usageQueryOptions,
} from "./usage-query";

describe("usage query", () => {
  it("polls every two minutes", () => {
    expect(USAGE_REFETCH_INTERVAL_MS).toBe(120_000);
    expect(usageQueryOptions(async () => ({ fetchedAt: "", providers: [] })).refetchInterval).toBe(
      120_000,
    );
  });

  it("refetches the shared snapshot query", async () => {
    const refetchQueries = vi.fn(async () => []);
    bindUsageQueryClient({ refetchQueries } as unknown as QueryClient);
    await refreshUsageSnapshot();
    expect(refetchQueries).toHaveBeenCalledWith({ queryKey: USAGE_QUERY_KEY });
  });
});
