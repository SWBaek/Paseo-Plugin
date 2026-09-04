import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  ALLOWED_USAGE_URLS,
  CODEX_USAGE_URL,
  GROK_USAGE_URL,
  assertAllowedUsageUrl,
  extractGrokTokenFromAuth,
  listProviderUsageSnapshot,
  type UsageHttpFetch,
} from "./provider-usage.server";

function jsonResponse(body: unknown, status = 200, contentType = "application/json"): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": contentType },
  });
}

function setup(options: {
  files?: Record<string, string>;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: UsageHttpFetch;
} = {}) {
  const files = options.files ?? {};
  const writes: string[] = [];
  const requestedUrls: string[] = [];
  const requestedMethods: Array<string | undefined> = [];
  const fetchImpl: UsageHttpFetch =
    options.fetchImpl ??
    (async (url, init) => {
      requestedUrls.push(url);
      requestedMethods.push(init.method);
      if (url === CODEX_USAGE_URL) {
        return jsonResponse({
          plan_type: "plus",
          rate_limit: {
            primary_window: { used_percent: 20, reset_at: 1_788_000_000 },
            secondary_window: { used_percent: 55, reset_at: 1_788_500_000 },
          },
          credits: { balance: 12.5 },
        });
      }
      if (url === GROK_USAGE_URL) {
        return jsonResponse({
          config: {
            monthlyLimit: { val: 100 },
            used: { val: 41 },
            creditUsagePercent: 41,
            currentPeriod: { type: "WEEKLY", end: "2026-09-11T00:00:00.000Z" },
          },
        });
      }
      throw new Error(`unexpected url ${url}`);
    });

  return {
    requestedUrls,
    requestedMethods,
    writes,
    options: {
      fetch: fetchImpl,
      homedir: () => "/home/paseo",
      env: options.env ?? {},
      readFile: async (path: string) => {
        const value = files[path];
        if (value === undefined) throw new Error(`missing ${path}`);
        return value;
      },
      fileExists: async (path: string) => path in files,
      now: () => new Date("2026-09-04T00:00:00.000Z"),
    },
  };
}

describe("provider usage fetchers", () => {
  it("allows only the Settings usage endpoints", () => {
    expect(ALLOWED_USAGE_URLS).toEqual([CODEX_USAGE_URL, GROK_USAGE_URL]);
    expect(() => assertAllowedUsageUrl(CODEX_USAGE_URL)).not.toThrow();
    expect(() => assertAllowedUsageUrl("https://example.com/usage")).toThrow(/allowlisted/i);
  });

  it("reads Codex and Grok usage without writing credential files", async () => {
    const context = setup({
      files: {
        [join("/home/paseo", ".codex", "auth.json")]: JSON.stringify({
          tokens: { access_token: "codex-token", account_id: "acct_1" },
        }),
        [join("/home/paseo", ".grok", "auth.json")]: JSON.stringify({
          access_token: "grok-token",
        }),
      },
    });

    const snapshot = await listProviderUsageSnapshot({}, context.options);

    expect(snapshot.fetchedAt).toBe("2026-09-04T00:00:00.000Z");
    expect(context.requestedUrls).toEqual([CODEX_USAGE_URL, GROK_USAGE_URL]);
    expect(context.requestedMethods).toEqual(["GET", "GET"]);
    expect(context.writes).toEqual([]);
    expect(snapshot.providers).toEqual([
      expect.objectContaining({
        id: "codex",
        status: "available",
        planLabel: "plus",
        windows: [
          expect.objectContaining({ id: "session", usedPercent: 20, remainingPercent: 80 }),
          expect.objectContaining({ id: "weekly", usedPercent: 55, remainingPercent: 45 }),
        ],
        balances: [expect.objectContaining({ remaining: 12.5, unit: "usd" })],
      }),
      expect.objectContaining({
        id: "grok",
        status: "available",
        windows: [expect.objectContaining({ id: "weekly", usedPercent: 41 })],
        balances: [expect.objectContaining({ used: 41, limit: 100, remaining: 59 })],
      }),
    ]);
  });

  it("extracts nested Grok tokens and keeps the credits query", async () => {
    expect(
      extractGrokTokenFromAuth({
        "https://auth.x.ai::user": { key: "nested-token" },
      }),
    ).toBe("nested-token");

    const context = setup({
      files: {
        [join("/home/paseo", ".grok", "auth.json")]: JSON.stringify({
          "https://auth.x.ai::user": { key: "nested-token" },
        }),
      },
    });
    await listProviderUsageSnapshot({ providerId: "grok" }, context.options);
    expect(context.requestedUrls).toEqual([GROK_USAGE_URL]);
    expect(GROK_USAGE_URL).toContain("format=credits");
  });

  it("marks missing credentials as unavailable instead of hiding the provider", async () => {
    const snapshot = await listProviderUsageSnapshot({}, setup().options);
    expect(snapshot.providers.map((provider) => provider.status)).toEqual(["unavailable", "unavailable"]);
    expect(snapshot.providers.every((provider) => provider.error === null)).toBe(true);
  });

  it("treats 401 and HTML Codex responses as unavailable", async () => {
    const unauthorized = setup({
      files: {
        [join("/home/paseo", ".codex", "auth.json")]: JSON.stringify({
          tokens: { access_token: "expired-token" },
        }),
      },
      fetchImpl: async () => new Response("nope", { status: 401 }),
    });
    const html = setup({
      files: {
        [join("/home/paseo", ".codex", "auth.json")]: JSON.stringify({
          tokens: { access_token: "expired-token" },
        }),
      },
      fetchImpl: async () => new Response("<html>login</html>", { status: 200 }),
    });

    expect((await listProviderUsageSnapshot({ providerId: "codex" }, unauthorized.options)).providers[0]?.status).toBe(
      "unavailable",
    );
    expect((await listProviderUsageSnapshot({ providerId: "codex" }, html.options)).providers[0]?.status).toBe(
      "unavailable",
    );
  });

  it("keeps HTTP failures visible and never includes tokens in error text", async () => {
    const context = setup({
      env: { GROK_API_KEY: "secret-grok-token" },
      fetchImpl: async (url) => {
        if (url === GROK_USAGE_URL) return new Response("nope", { status: 500 });
        throw new Error(`unexpected ${url}`);
      },
    });
    const snapshot = await listProviderUsageSnapshot({ providerId: "grok" }, context.options);
    expect(snapshot.providers[0]?.status).toBe("error");
    expect(snapshot.providers[0]?.error).toMatch(/500/);
    expect(JSON.stringify(snapshot)).not.toContain("secret-grok-token");
  });

  it("rejects non-allowlisted fetch attempts before they leave the plugin", async () => {
    await expect(
      listProviderUsageSnapshot(
        { providerId: "grok" },
        setup({
          env: { GROK_TOKEN: "token" },
          fetchImpl: async () => {
            assertAllowedUsageUrl("https://evil.example/steal");
            return jsonResponse({});
          },
        }).options,
      ),
    ).resolves.toMatchObject({
      providers: [expect.objectContaining({ status: "error", error: expect.stringMatching(/allowlisted/i) })],
    });
  });
});
