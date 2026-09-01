import { describe, expect, it, vi } from "vitest";
import { createSkillsModalController } from "./skills-modal";

describe("skills modal controller", () => {
  it("opens for a request and resolves true only after confirmation", async () => {
    const modal = createSkillsModalController();
    const listener = vi.fn();
    modal.subscribe("agent-1", listener);

    const result = modal.request("agent-1");
    expect(listener.mock.calls).toEqual([[false], [true]]);

    modal.resolve("agent-1", true);
    await expect(result).resolves.toBe(true);
    expect(listener).toHaveBeenLastCalledWith(false);
  });

  it("resolves false when the modal dismisses", async () => {
    const modal = createSkillsModalController();
    modal.subscribe("agent-1", () => {});

    const result = modal.request("agent-1");
    modal.resolve("agent-1", false);

    await expect(result).resolves.toBe(false);
  });

  it("shares one pending request per agent", async () => {
    const modal = createSkillsModalController();
    modal.subscribe("agent-1", () => {});

    const first = modal.request("agent-1");
    const second = modal.request("agent-1");
    expect(second).toBe(first);

    modal.resolve("agent-1", true);
    await expect(Promise.all([first, second])).resolves.toEqual([true, true]);
  });

  it("cancels a pending request when its pill unmounts", async () => {
    const modal = createSkillsModalController();
    const unsubscribe = modal.subscribe("agent-1", () => {});
    const result = modal.request("agent-1");

    unsubscribe();

    await expect(result).resolves.toBe(false);
  });

  it("cancels every pending request during plugin cleanup", async () => {
    const modal = createSkillsModalController();
    modal.subscribe("agent-1", () => {});
    modal.subscribe("agent-2", () => {});
    const first = modal.request("agent-1");
    const second = modal.request("agent-2");

    modal.dispose();

    await expect(Promise.all([first, second])).resolves.toEqual([false, false]);
    await expect(modal.request("agent-1")).resolves.toBe(false);
  });
});
