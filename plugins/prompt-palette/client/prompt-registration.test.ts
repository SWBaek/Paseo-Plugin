import type { PluginClientContext, PluginComposerPillContribution } from "@getpaseo/plugin/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { registerPromptPills } from "./prompt-registration";
type Update = Parameters<Parameters<PluginClientContext["paseo"]["agents"]["subscribe"]>[0]>[0];
type Page = {
  requestId: string;
  entries: Array<{ agent: { id: string; workspaceId?: string } }>;
  pageInfo: { nextCursor: string | null; prevCursor: null; hasMore: boolean };
};
type ListFn = (options?: { scope?: string; page?: { limit?: number; cursor?: string }; subscribe?: object }) => Promise<Page>;
const page = (ids: string[], cursor: string | null = null): Page => ({
  requestId: "test", entries: ids.map(id => ({ agent: { id, workspaceId: "w" } })),
  pageInfo: { nextCursor: cursor, prevCursor: null, hasMore: !!cursor },
});
const upsert = (id: string, workspaceId = "w", archivedAt: string | null = null) => ({ kind: "upsert", agent: { id, workspaceId, archivedAt } }) as Update;
function setup(list = vi.fn<ListFn>(async () => page([]))) {
  let emit!: (u: Update) => void;
  const unsubscribe = vi.fn();
  const entries: PluginComposerPillContribution[] = [];
  const remove = vi.fn();
  const update = vi.fn();
  const client = { paseo: { agents: { list, subscribe: (fn: typeof emit) => { emit = fn; return unsubscribe; } } },
    addComposerPill: (p: PluginComposerPillContribution) => { entries.push(p); return { remove, update }; } } as unknown as PluginClientContext;
  const component = vi.fn<Parameters<typeof registerPromptPills>[1]>(() => () => null);
  const cleanup = registerPromptPills(client, component);
  return { entries, component, cleanup, remove, update, unsubscribe, list, emit: (u: Update) => emit(u) };
}
afterEach(() => { vi.useRealTimers(); });
describe("prompt registrations", () => {
  it("updates the existing button while sending and unsubscribes before a late completion", async () => {
    vi.useFakeTimers();
    const t = setup(); t.emit(upsert("a"));
    const sender = t.component.mock.calls[0][0];
    let finish!: () => void;
    const send = sender.send(async () => true, () => new Promise<void>(resolve => { finish = resolve; }));
    await Promise.resolve();
    expect(t.update).toHaveBeenLastCalledWith({ label: "Sending…" });
    expect(t.entries).toHaveLength(1);
    finish(); await send;
    expect(t.update).toHaveBeenLastCalledWith({ label: "Prompts" });
    const late = sender.send(async () => true, () => new Promise<void>(resolve => { finish = resolve; }));
    await Promise.resolve();
    t.cleanup(); const calls = t.update.mock.calls.length;
    finish(); await late;
    expect(t.update).toHaveBeenCalledTimes(calls);
    expect(t.remove).toHaveBeenCalledTimes(1);
  });
  it("loads every page and registers new providers without filtering", async () => {
    vi.useFakeTimers();
    const list = vi.fn<ListFn>()
      .mockResolvedValueOnce(page(["a"], "next")).mockResolvedValueOnce(page(["b"]));
    const t = setup(list); await vi.advanceTimersByTimeAsync(0);
    expect(t.entries.map(p => p.agentId)).toEqual(["a", "b"]);
    expect(list.mock.calls[0][0]).toMatchObject({ scope: "active", subscribe: {} });
    expect(list.mock.calls[1][0]?.page?.cursor).toBe("next");
    expect(list.mock.calls[1][0]?.subscribe).toBeUndefined();
    t.emit(upsert("new")); expect(t.entries.at(-1)?.agentId).toBe("new");
    t.cleanup(); expect(vi.getTimerCount()).toBe(0);
  });
  it("does not resurrect an Agent removed while the initial list is pending", async () => {
    vi.useFakeTimers();
    let resolve!: (p: Page) => void;
    const t = setup(vi.fn(() => new Promise<Page>(r => { resolve = r; })));
    t.emit({ kind: "remove", agentId: "a" } as Update);
    resolve(page(["a"])); await vi.advanceTimersByTimeAsync(0);
    expect(t.entries).toHaveLength(0); t.cleanup();
  });
  it("preserves a newer workspace event over stale list data and disposes moved pills", async () => {
    vi.useFakeTimers();
    let resolve!: (p: Page) => void;
    const t = setup(vi.fn(() => new Promise<Page>(r => { resolve = r; })));
    t.emit(upsert("a", "new")); resolve(page(["a"])); await vi.advanceTimersByTimeAsync(0);
    expect(t.entries[0].workspaceId).toBe("new");
    expect(t.entries[0].button.icon).toBe("MessagesSquare");
    expect(t.entries[0].button.behavior.kind).toBe("popover");
    if (t.entries[0].button.behavior.kind === "popover") {
      expect(t.entries[0].button.behavior.Content).toBe(t.component.mock.results[0].value);
    }
    t.emit(upsert("a", "moved"));
    expect(t.remove).toHaveBeenCalledTimes(1);
    t.emit(upsert("a", "moved", "archived"));
    expect(t.remove).toHaveBeenCalledTimes(2); t.cleanup();
  });
  it("retries failed enumeration and removes pills missing from a complete refresh", async () => {
    vi.useFakeTimers();
    const list = vi.fn<ListFn>()
      .mockRejectedValueOnce(Error("offline")).mockResolvedValueOnce(page(["a"])).mockResolvedValue(page([]));
    const t = setup(list); await vi.advanceTimersByTimeAsync(30000);
    expect(t.entries).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(30000); expect(t.remove).toHaveBeenCalledTimes(1);
    t.cleanup(); expect(t.unsubscribe).toHaveBeenCalledTimes(1);
  });
  it("ignores late list results, events and clicks after disposal", async () => {
    vi.useFakeTimers();
    let resolve!: (p: Page) => void;
    const t = setup(vi.fn(() => new Promise<Page>(r => { resolve = r; })));
    t.emit(upsert("a")); t.cleanup(); resolve(page(["b"])); t.emit(upsert("c"));
    await vi.advanceTimersByTimeAsync(0);
    expect(t.entries).toHaveLength(1);
    expect(t.entries[0].button.behavior.kind).toBe("popover");
    expect(vi.getTimerCount()).toBe(0);
  });
  it("does not prune existing pills after a malformed incomplete page", async () => {
    vi.useFakeTimers();
    const malformed = page([]);
    malformed.pageInfo.hasMore = true;
    const list = vi.fn<ListFn>()
      .mockResolvedValueOnce(page(["a"])).mockResolvedValue(malformed);
    const t = setup(list); await vi.advanceTimersByTimeAsync(30000);
    expect(t.entries).toHaveLength(1);
    expect(t.remove).not.toHaveBeenCalled();
    t.cleanup(); t.cleanup();
    expect(t.unsubscribe).toHaveBeenCalledTimes(1);
  });
});
