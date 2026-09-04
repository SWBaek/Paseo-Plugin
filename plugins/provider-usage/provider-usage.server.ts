import { promises as fs } from "node:fs";
import { homedir as osHomedir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import {
  toneFromRemaining,
  toneFromUsedPercent,
  usedPercentOf,
  windowFromUsedPercent,
} from "./provider-usage.logic";
import {
  ProviderUsageSnapshotSchema,
  type ProviderUsage,
  type ProviderUsageSnapshot,
  type SupportedProviderId,
} from "./provider-usage.shared";

export const HTTP_TIMEOUT_MS = 15_000;
export const CODEX_USAGE_URL = "https://chatgpt.com/backend-api/wham/usage";
export const GROK_USAGE_URL = "https://cli-chat-proxy.grok.com/v1/billing?format=credits";
export const ALLOWED_USAGE_URLS = [CODEX_USAGE_URL, GROK_USAGE_URL] as const;

const ApiNumberSchema = z.coerce.number().finite();
const ApiOptionalStringSchema = z.preprocess(
  (value) => (value == null ? undefined : value),
  z.coerce.string().optional(),
);

const CodexAuthSchema = z.object({
  tokens: z
    .object({
      access_token: z.string().optional(),
      account_id: z.string().optional(),
    })
    .optional(),
});

const CodexWindowSchema = z.object({
  used_percent: ApiNumberSchema.optional(),
  reset_at: ApiNumberSchema.optional(),
});

const CodexUsageResponseSchema = z.object({
  plan_type: z.string().optional(),
  rate_limit: z
    .object({
      primary_window: CodexWindowSchema.nullish(),
      secondary_window: CodexWindowSchema.nullish(),
    })
    .nullish(),
  code_review_rate_limit: z
    .object({
      primary_window: CodexWindowSchema.nullish(),
    })
    .nullish(),
  credits: z
    .object({
      balance: ApiNumberSchema.optional(),
    })
    .nullish(),
});

const GrokUsageResponseSchema = z.object({
  config: z
    .object({
      monthlyLimit: z.object({ val: ApiNumberSchema.optional() }).nullish(),
      used: z.object({ val: ApiNumberSchema.optional() }).nullish(),
      creditUsagePercent: ApiNumberSchema.optional(),
      currentPeriod: z
        .object({
          type: ApiOptionalStringSchema,
          end: ApiOptionalStringSchema,
        })
        .nullish(),
    })
    .nullish(),
  usage: z
    .object({
      creditUsage: ApiNumberSchema.optional(),
    })
    .nullish(),
});

export type UsageHttpFetch = (input: string, init: RequestInit) => Promise<Response>;

export interface UsageSnapshotOptions {
  fetch?: UsageHttpFetch;
  homedir?: () => string;
  env?: NodeJS.ProcessEnv;
  readFile?: (path: string) => Promise<string>;
  fileExists?: (path: string) => Promise<boolean>;
  now?: () => Date;
}

function defaultFileExists(path: string): Promise<boolean> {
  return fs.access(path).then(
    () => true,
    () => false,
  );
}

export function assertAllowedUsageUrl(url: string): void {
  if ((ALLOWED_USAGE_URLS as readonly string[]).includes(url)) return;
  throw new Error(`Blocked non-allowlisted usage URL: ${url}`);
}

export function extractGrokTokenFromAuth(auth: unknown): string | null {
  if (auth == null || typeof auth !== "object" || Array.isArray(auth)) return null;
  const record = auth as Record<string, unknown>;
  const topLevel = record["access_token"];
  if (typeof topLevel === "string" && topLevel.length > 0) return topLevel;

  const entries = Object.entries(record);
  const preferred = entries.filter(([key]) => key.startsWith("https://auth.x.ai::"));
  const candidates = preferred.length > 0 ? preferred : entries;
  for (const [, value] of candidates) {
    if (value == null || typeof value !== "object" || Array.isArray(value)) continue;
    const nestedKey = (value as Record<string, unknown>)["key"];
    if (typeof nestedKey === "string" && nestedKey.length > 0) return nestedKey;
  }
  return null;
}

function redactSensitiveText(value: string): string {
  return value
    .replace(/Bearer\s+\S+/giu, "Bearer [REDACTED]")
    .replace(/sk-[A-Za-z0-9._-]+/gu, "[REDACTED]")
    .replace(/eyJ[A-Za-z0-9._-]+/gu, "[REDACTED]")
    .trim()
    .slice(0, 240);
}

function publicErrorMessage(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : String(error);
  const redacted = redactSensitiveText(message);
  return redacted.length > 0 ? redacted : fallback;
}

function unavailable(providerId: SupportedProviderId, label: string, error: string | null = null): ProviderUsage {
  return {
    id: providerId,
    label,
    status: error ? "error" : "unavailable",
    planLabel: null,
    windows: [],
    balances: [],
    error,
  };
}

function toIsoFromUnixSeconds(value: number | undefined): string | null {
  if (typeof value !== "number") return null;
  const date = new Date(value * 1000);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

async function fetchAllowedJson(
  fetchApi: UsageHttpFetch,
  url: string,
  headers: Record<string, string>,
): Promise<{ status: number; text: string }> {
  assertAllowedUsageUrl(url);
  const response = await fetchApi(url, {
    method: "GET",
    headers,
    signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
  });
  const text = await response.text();
  return { status: response.status, text };
}

async function readFirstExistingJson(
  paths: readonly string[],
  fileExists: (path: string) => Promise<boolean>,
  readFile: (path: string) => Promise<string>,
): Promise<unknown | null> {
  for (const path of paths) {
    if (!(await fileExists(path))) continue;
    try {
      return JSON.parse(await readFile(path));
    } catch {
      continue;
    }
  }
  return null;
}

async function fetchCodexUsage(options: Required<Pick<UsageSnapshotOptions, "fetch" | "homedir" | "env" | "readFile" | "fileExists">>): Promise<ProviderUsage> {
  const home = options.homedir();
  const envHome = options.env["CODEX_HOME"];
  const authPaths = [
    ...(typeof envHome === "string" && envHome.length > 0 ? [join(envHome, "auth.json")] : []),
    join(home, ".config", "codex", "auth.json"),
    join(home, ".codex", "auth.json"),
  ];
  const parsed = CodexAuthSchema.safeParse(
    await readFirstExistingJson(authPaths, options.fileExists, options.readFile),
  );
  const accessToken = parsed.success ? parsed.data.tokens?.access_token : undefined;
  if (!accessToken) return unavailable("codex", "Codex");

  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    Accept: "application/json",
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
  };
  const accountId = parsed.success ? parsed.data.tokens?.account_id : undefined;
  if (accountId) headers["ChatGPT-Account-Id"] = accountId;

  try {
    const { status, text } = await fetchAllowedJson(options.fetch, CODEX_USAGE_URL, headers);
    if (status === 401 || status === 403 || text.trim().startsWith("<")) {
      return unavailable("codex", "Codex");
    }
    if (status < 200 || status >= 300) {
      return unavailable("codex", "Codex", `Codex usage API returned ${status}`);
    }
    const response = CodexUsageResponseSchema.parse(JSON.parse(text));
    const windows = [
      response.rate_limit?.primary_window
        ? windowFromUsedPercent({
            id: "session",
            label: "Session",
            usedPercent: response.rate_limit.primary_window.used_percent,
            resetsAt: toIsoFromUnixSeconds(response.rate_limit.primary_window.reset_at),
          })
        : null,
      response.rate_limit?.secondary_window
        ? windowFromUsedPercent({
            id: "weekly",
            label: "Weekly",
            usedPercent: response.rate_limit.secondary_window.used_percent,
            resetsAt: toIsoFromUnixSeconds(response.rate_limit.secondary_window.reset_at),
          })
        : null,
      response.code_review_rate_limit?.primary_window
        ? windowFromUsedPercent({
            id: "code_review",
            label: "Code review",
            usedPercent: response.code_review_rate_limit.primary_window.used_percent,
            resetsAt: toIsoFromUnixSeconds(response.code_review_rate_limit.primary_window.reset_at),
          })
        : null,
    ].filter((window) => window !== null);

    return {
      id: "codex",
      label: "Codex",
      status: "available",
      planLabel: response.plan_type ?? null,
      windows,
      balances:
        response.credits?.balance === undefined
          ? []
          : [
              {
                id: "credits",
                label: "Credits",
                used: null,
                remaining: response.credits.balance,
                limit: null,
                unit: "usd",
                tone: toneFromRemaining(response.credits.balance),
              },
            ],
      error: null,
    };
  } catch (error) {
    return unavailable("codex", "Codex", publicErrorMessage(error, "Codex usage could not be read"));
  }
}

async function fetchGrokUsage(options: Required<Pick<UsageSnapshotOptions, "fetch" | "homedir" | "env" | "readFile" | "fileExists">>): Promise<ProviderUsage> {
  const envToken = options.env["GROK_API_KEY"] || options.env["GROK_TOKEN"];
  let token = typeof envToken === "string" && envToken.length > 0 ? envToken : null;
  if (!token) {
    const authPath = join(options.homedir(), ".grok", "auth.json");
    if (await options.fileExists(authPath)) {
      try {
        token = extractGrokTokenFromAuth(JSON.parse(await options.readFile(authPath)));
      } catch {
        token = null;
      }
    }
  }
  if (!token) return unavailable("grok", "Grok");

  try {
    const { status, text } = await fetchAllowedJson(options.fetch, GROK_USAGE_URL, {
      Authorization: `Bearer ${token}`,
      "X-XAI-Token-Auth": "xai-grok-cli",
      Accept: "application/json",
    });
    if (status === 401 || status === 403) return unavailable("grok", "Grok");
    if (status < 200 || status >= 300) {
      return unavailable("grok", "Grok", `Grok usage API returned ${status}`);
    }
    const response = GrokUsageResponseSchema.parse(JSON.parse(text));
    const limit = response.config?.monthlyLimit?.val ?? null;
    const used = response.config?.used?.val ?? response.usage?.creditUsage ?? null;
    const percent = response.config?.creditUsagePercent ?? usedPercentOf(used, limit);
    const period = response.config?.currentPeriod;
    const weekly = (period?.type ?? "").toUpperCase().includes("WEEKLY");

    return {
      id: "grok",
      label: "Grok",
      status: "available",
      planLabel: null,
      windows:
        typeof percent === "number"
          ? [
              windowFromUsedPercent({
                id: weekly ? "weekly" : "monthly",
                label: weekly ? "Weekly" : "Monthly",
                usedPercent: percent,
                resetsAt: period?.end ?? null,
              }),
            ]
          : [],
      balances:
        limit === null && used === null
          ? []
          : [
              {
                id: "monthly_credits",
                label: "Monthly credits",
                used,
                remaining: limit !== null && used !== null ? Math.max(0, limit - used) : null,
                limit,
                unit: "credits",
                tone: toneFromUsedPercent(usedPercentOf(used, limit)),
              },
            ],
      error: null,
    };
  } catch (error) {
    return unavailable("grok", "Grok", publicErrorMessage(error, "Grok usage could not be read"));
  }
}

export async function listProviderUsageSnapshot(
  input: { providerId?: string } = {},
  options: UsageSnapshotOptions = {},
): Promise<ProviderUsageSnapshot> {
  const resolved = {
    fetch: options.fetch ?? ((url: string, init: RequestInit) => fetch(url, init)),
    homedir: options.homedir ?? osHomedir,
    env: options.env ?? process.env,
    readFile: options.readFile ?? ((path: string) => fs.readFile(path, "utf8")),
    fileExists: options.fileExists ?? defaultFileExists,
    now: options.now ?? (() => new Date()),
  };

  const requested = input.providerId?.trim().toLowerCase();
  const providers: ProviderUsage[] = [];
  if (!requested || requested === "codex") providers.push(await fetchCodexUsage(resolved));
  if (!requested || requested === "grok") providers.push(await fetchGrokUsage(resolved));
  return ProviderUsageSnapshotSchema.parse({
    fetchedAt: resolved.now().toISOString(),
    providers,
  });
}
