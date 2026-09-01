export type SkillsModalListener = (open: boolean) => void;

export interface SkillsModalController {
  request(agentId: string): Promise<boolean>;
  subscribe(agentId: string, listener: SkillsModalListener): () => void;
  resolve(agentId: string, confirmed: boolean): void;
  dispose(): void;
}

interface PendingModal {
  promise: Promise<boolean>;
  resolve(confirmed: boolean): void;
}

export function createSkillsModalController(): SkillsModalController {
  const listeners = new Map<string, Set<SkillsModalListener>>();
  const pending = new Map<string, PendingModal>();
  let disposed = false;

  function notify(agentId: string, open: boolean) {
    for (const listener of listeners.get(agentId) ?? []) listener(open);
  }

  function resolve(agentId: string, confirmed: boolean) {
    const modal = pending.get(agentId);
    if (!modal) return;

    pending.delete(agentId);
    notify(agentId, false);
    modal.resolve(confirmed);
  }

  return {
    request(agentId) {
      if (disposed) return Promise.resolve(false);

      const existing = pending.get(agentId);
      if (existing) return existing.promise;

      let settle: (confirmed: boolean) => void = () => {};
      const promise = new Promise<boolean>((resolvePromise) => {
        settle = resolvePromise;
      });
      pending.set(agentId, { promise, resolve: settle });
      notify(agentId, true);
      return promise;
    },

    subscribe(agentId, listener) {
      if (disposed) {
        listener(false);
        return () => {};
      }

      const agentListeners = listeners.get(agentId) ?? new Set();
      agentListeners.add(listener);
      listeners.set(agentId, agentListeners);
      listener(pending.has(agentId));

      return () => {
        agentListeners.delete(listener);
        if (agentListeners.size > 0) return;

        listeners.delete(agentId);
        resolve(agentId, false);
      };
    },

    resolve,

    dispose() {
      if (disposed) return;
      disposed = true;

      for (const agentId of [...pending.keys()]) resolve(agentId, false);
      listeners.clear();
    },
  };
}
