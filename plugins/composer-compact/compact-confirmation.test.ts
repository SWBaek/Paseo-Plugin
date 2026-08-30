import { describe, expect, it, vi } from "vitest";
import { createCompactConfirmationController } from "./compact-confirmation";

describe("compact confirmation controller", () => {
  it("opens for a request and resolves true only after confirmation", async () => {
    const confirmation = createCompactConfirmationController();
    const listener = vi.fn();
    confirmation.subscribe("agent-1", listener);

    const result = confirmation.request("agent-1");
    expect(listener.mock.calls).toEqual([[false], [true]]);

    confirmation.resolve("agent-1", true);
    await expect(result).resolves.toBe(true);
    expect(listener).toHaveBeenLastCalledWith(false);
  });

  it("resolves false when the modal dismisses", async () => {
    const confirmation = createCompactConfirmationController();
    confirmation.subscribe("agent-1", () => {});

    const result = confirmation.request("agent-1");
    confirmation.resolve("agent-1", false);

    await expect(result).resolves.toBe(false);
  });

  it("shares one pending request per agent", async () => {
    const confirmation = createCompactConfirmationController();
    confirmation.subscribe("agent-1", () => {});

    const first = confirmation.request("agent-1");
    const second = confirmation.request("agent-1");
    expect(second).toBe(first);

    confirmation.resolve("agent-1", true);
    await expect(Promise.all([first, second])).resolves.toEqual([true, true]);
  });

  it("cancels a pending request when its pill unmounts", async () => {
    const confirmation = createCompactConfirmationController();
    const unsubscribe = confirmation.subscribe("agent-1", () => {});
    const result = confirmation.request("agent-1");

    unsubscribe();

    await expect(result).resolves.toBe(false);
  });

  it("cancels every pending request during plugin cleanup", async () => {
    const confirmation = createCompactConfirmationController();
    confirmation.subscribe("agent-1", () => {});
    confirmation.subscribe("agent-2", () => {});
    const first = confirmation.request("agent-1");
    const second = confirmation.request("agent-2");

    confirmation.dispose();

    await expect(Promise.all([first, second])).resolves.toEqual([false, false]);
    await expect(confirmation.request("agent-1")).resolves.toBe(false);
  });
});
