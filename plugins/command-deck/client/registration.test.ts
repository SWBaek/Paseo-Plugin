import { afterEach, describe, expect, it, vi } from "vitest";
import type { PluginClientContext, PluginComposerPillContribution } from "@getpaseo/plugin/client";
import { registerCommandPills } from "./registration";
type Agent = { id: string; workspaceId: string; archivedAt?: string };
function setup() {
  let emit: (update: unknown) => void = () => {};
  const contributions: PluginComposerPillContribution[] = [];
  const removers: ReturnType<typeof vi.fn>[] = [];
  const unsubscribe = vi.fn();
  const list = vi.fn(async (_options?: { scope?: string; page?: { limit?: number; cursor?: string }; subscribe?: object }) => ({ entries: [{ agent: { id: "a", workspaceId: "w" } as Agent }], pageInfo: { hasMore: false, nextCursor: null as string | null } }));
  const openPanel = vi.fn();
  const client = { paseo: { agents: { list, subscribe: (callback: typeof emit) => { emit = callback; return unsubscribe; } } },
    openPanel, addComposerPill: (value: PluginComposerPillContribution) => { contributions.push(value); const remove = vi.fn(); removers.push(remove); return { remove, update: vi.fn() }; } } as unknown as PluginClientContext;
  return { client, list, contributions, removers, unsubscribe, openPanel, emit: (update: unknown) => emit(update) };
}
afterEach(() => vi.useRealTimers());
describe("command pill lifetime", () => {
  it("registers once, opens the workspace panel and cleans up idempotently", async () => {
    vi.useFakeTimers(); const f = setup(); const dispose = registerCommandPills(f.client);
    await Promise.resolve(); expect(f.contributions).toHaveLength(1);
    expect(f.list.mock.calls[0][0]).toMatchObject({ scope: "active", subscribe: {} });
    press(f.contributions[0]); expect(f.openPanel).toHaveBeenCalledWith("commands", { workspaceId: "w" });
    await vi.advanceTimersByTimeAsync(30000); expect(f.contributions).toHaveLength(1);
    expect(f.list.mock.calls[1][0]?.subscribe).toBeUndefined();
    dispose(); dispose(); expect(f.removers[0]).toHaveBeenCalledTimes(1); expect(f.unsubscribe).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(60000); expect(f.list).toHaveBeenCalledTimes(2);
  });
  it("moves pills with agents and removes archived or removed agents", async () => {
    const f = setup(); const dispose = registerCommandPills(f.client); await Promise.resolve();
    f.emit({ kind: "upsert", agent: { id: "a", workspaceId: "new" } });
    expect(f.removers[0]).toHaveBeenCalledTimes(1); press(f.contributions[1]);
    expect(f.openPanel).toHaveBeenLastCalledWith("commands", { workspaceId: "new" });
    f.emit({ kind: "upsert", agent: { id: "a", workspaceId: "new", archivedAt: "now" } });
    expect(f.removers[1]).toHaveBeenCalledTimes(1); dispose();
  });
  it("does not resurrect an agent removed while an initial fetch was pending", async () => {
    const f = setup(); let resolve!: (value: Awaited<ReturnType<typeof f.list>>) => void;
    f.list.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    const dispose = registerCommandPills(f.client);
    f.emit({ kind: "remove", agentId: "a" });
    resolve({ entries: [{ agent: { id: "a", workspaceId: "w" } }], pageInfo: { hasMore: false, nextCursor: null } });
    await Promise.resolve(); expect(f.contributions).toHaveLength(0); dispose();
  });
  it("ignores a late listing after disposal", async () => {
    const f = setup(); let resolve!: (value: Awaited<ReturnType<typeof f.list>>) => void;
    f.list.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    const dispose = registerCommandPills(f.client); dispose();
    resolve({ entries: [{ agent: { id: "a", workspaceId: "w" } }], pageInfo: { hasMore: false, nextCursor: null } });
    await Promise.resolve(); expect(f.contributions).toHaveLength(0);
  });
});

function press(pill: PluginComposerPillContribution) {
  if (pill.button.behavior.kind !== "action") throw new Error("Expected action");
  return pill.button.behavior.onPress();
}
