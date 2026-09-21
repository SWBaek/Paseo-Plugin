import type { PluginButtonContentProps, PluginClientContext } from "@getpaseo/plugin/client";
import type { ComponentType } from "react";
import { createPromptSender, type PromptSender } from "./prompt-send";

export function registerPromptPills(client: PluginClientContext,
  content: (sender: PromptSender) => ComponentType<PluginButtonContentProps>) {
  let active = true;
  let loading = false;
  const changed = new Set<string>();
  const pills = new Map<string, { workspaceId: string; remove(): unknown; sender: PromptSender }>();
  function remove(id: string) {
    const pill = pills.get(id);
    if (!pill) return;
    pill.sender.dispose(); void pill.remove(); pills.delete(id);
  }
  function sync(agent: { id: string; workspaceId?: string; archivedAt?: string | null }) {
    if (!agent.workspaceId || agent.archivedAt) { remove(agent.id); return; }
    if (pills.get(agent.id)?.workspaceId === agent.workspaceId) return;
    remove(agent.id);
    const sender = createPromptSender();
    const cleanup = client.addComposerPill({
      id: "prompts", agentId: agent.id, workspaceId: agent.workspaceId,
      button: { title: "Open saved prompts", label: "Prompts", icon: "MessagesSquare",
        behavior: { kind: "popover", Content: content(sender) } },
    });
    // Disabling a popover trigger closes its host-owned content. The sender itself
    // serializes sends, while the picker reflects its pending state locally.
    const unsubscribeSender = sender.subscribe(() => cleanup.update({ label: sender.pending ? "Sending…" : "Prompts" }));
    pills.set(agent.id, { workspaceId: agent.workspaceId, remove: () => { unsubscribeSender(); cleanup.remove(); }, sender });
  }
  const unsubscribe = client.paseo.agents.subscribe(update => {
    if (!active) return;
    const id = update.kind === "remove" ? update.agentId : update.agent.id;
    if (loading) changed.add(id);
    if (update.kind === "remove") remove(id); else sync(update.agent);
  });
  let observing = false;
  let observation: { release(): Promise<void> } | undefined;
  async function refresh() {
    if (!active || loading) return;
    loading = true; changed.clear();
    const seen = new Set<string>();
    const cursors = new Set<string>();
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
        for (const { agent } of page.entries) {
          seen.add(agent.id);
          if (!changed.has(agent.id)) sync(agent);
        }
        if (page.pageInfo.hasMore && !page.pageInfo.nextCursor) throw new Error("Missing page cursor");
        cursor = page.pageInfo.hasMore ? page.pageInfo.nextCursor ?? undefined : undefined;
        if (cursor && cursors.has(cursor)) throw new Error("Repeated page cursor");
        if (cursor) cursors.add(cursor);
      } while (cursor);
      for (const id of pills.keys()) if (!seen.has(id) && !changed.has(id)) remove(id);
    } catch {
      // Preserve verified pills; the next refresh recovers missed directory events.
    } finally { loading = false; changed.clear(); }
  }
  void refresh();
  const timer = setInterval(() => { void refresh(); }, 30000);
  return () => {
    if (!active) return;
    active = false; clearInterval(timer); unsubscribe();
    void observation?.release();
    observation = undefined;
    for (const id of pills.keys()) remove(id);
  };
}
