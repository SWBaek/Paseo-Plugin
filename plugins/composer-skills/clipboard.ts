export class ClipboardUnavailableError extends Error {
  constructor(message = "Clipboard is unavailable") {
    super(message);
    this.name = "ClipboardUnavailableError";
  }
}

export type ClipboardPlatform = "ios" | "android" | "web";

export async function copyTextToClipboard(
  text: string,
  platform: ClipboardPlatform,
): Promise<void> {
  if (platform !== "web") {
    throw new ClipboardUnavailableError();
  }

  const clipboard = globalThis.navigator?.clipboard;
  if (!clipboard?.writeText) {
    throw new ClipboardUnavailableError();
  }

  await clipboard.writeText(text);
}
