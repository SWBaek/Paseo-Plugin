import { afterEach, describe, expect, it, vi } from "vitest";
import { ClipboardUnavailableError, copyTextToClipboard } from "./clipboard";

const originalNavigator = globalThis.navigator;

afterEach(() => {
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: originalNavigator,
  });
});

describe("copyTextToClipboard", () => {
  it("writes text through the web clipboard API", async () => {
    const writeText = vi.fn(async () => {});
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: { clipboard: { writeText } },
    });

    await copyTextToClipboard("github-branch-cleanup", "web");
    expect(writeText).toHaveBeenCalledWith("github-branch-cleanup");
  });

  it("rejects when the web clipboard API is missing", async () => {
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: {},
    });

    await expect(copyTextToClipboard("draft", "web")).rejects.toBeInstanceOf(
      ClipboardUnavailableError,
    );
  });

  it("does not use browser globals on native platforms", async () => {
    const writeText = vi.fn(async () => {});
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: { clipboard: { writeText } },
    });

    await expect(copyTextToClipboard("draft", "ios")).rejects.toBeInstanceOf(
      ClipboardUnavailableError,
    );
    expect(writeText).not.toHaveBeenCalled();
  });
});
