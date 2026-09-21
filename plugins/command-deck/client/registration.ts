import type { PluginClientContext } from "@getpaseo/plugin/client";

export function registerCommandPills(client: PluginClientContext) {
  let active = true;
  let loading = false;
  const touched = new Set<string>();
  const pills = new Map<string, { workspaceId: string; remove(): unknown }>();
  function remove(id: string) { void pills.get(id)?.remove(); pills.delete(id); }
  function sync(agent: { id: string; workspaceId?: string; archivedAt?: string | null }) {
    if (!agent.workspaceId || agent.archivedAt) { remove(agent.id); return; }
    if (pills.get(agent.id)?.workspaceId === agent.workspaceId) return;
    remove(agent.id);
    const workspaceId = agent.workspaceId;
    const registration = client.addComposerPill({ id: "commands", workspaceId, agentId: agent.id,
      button: { title: "Open commands", label: "Commands", icon: "Terminal",
        behavior: { kind: "action", onPress: () => { if (active) client.openPanel("commands", { workspaceId }); } } } });
    pills.set(agent.id, { workspaceId, remove: () => registration.remove() });
  }
  const unsubscribe = client.paseo.agents.subscribe(update => {
    if (!active) return;
    const id = update.kind === "remove" ? update.agentId : update.agent.id;
    if (loading) touched.add(id);
    if (update.kind === "remove") remove(id); else sync(update.agent);
  });
  let observing = false;
  let observation: { release(): Promise<void> } | undefined;
  async function refresh() {
    if (!active || loading) return;
    loading = true; touched.clear();
    const seen = new Set<string>(); const cursors = new Set<string>();
    try {
      let cursor: string | undefined;
      do {
        const page = observing || cursor
          ? await client.paseo.agents.list({ scope: "active", page: { limit: 200, cursor } })
          : await client.paseo.agents.list({ scope: "active", page: { limit: 200 }, subscribe: {} });
        observing = true;
        if (page.subscription) observation = page.subscription;
        if (!active) {
          void observation?.release();
          observation = undefined;
          return;
        }
        for (const { agent } of page.entries) { seen.add(agent.id); if (!touched.has(agent.id)) sync(agent); }
        if (page.pageInfo.hasMore && !page.pageInfo.nextCursor) throw new Error("Incomplete Agent listing");
        cursor = page.pageInfo.hasMore ? page.pageInfo.nextCursor ?? undefined : undefined;
        if (cursor && cursors.has(cursor)) throw new Error("Repeated Agent page");
        if (cursor) cursors.add(cursor);
      } while (cursor);
      for (const id of pills.keys()) if (!seen.has(id) && !touched.has(id)) remove(id);
    } catch { /* Keep verified registrations; the next refresh recovers missed events. */ }
    finally { loading = false; touched.clear(); }
  }
  void refresh(); const timer = setInterval(() => { void refresh(); }, 30000);
  return () => {
    if (!active) return;
    active = false; clearInterval(timer); unsubscribe();
    void observation?.release();
    observation = undefined;
    for (const id of pills.keys()) remove(id);
  };
}
