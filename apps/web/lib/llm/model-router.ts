import "server-only";

import { createHash } from "node:crypto";

import { isAuthError, isRetryableError, shouldFallbackToAnotherModel, type Provider } from "./client";
import { LLM_PROVIDER_IDS } from "@/lib/llm-config";
import { sleep } from "../utils";

/**
 * Provider-agnostic LLM router with key rotation, per-key cooldown, and
 * cross-provider model fallback. This is the single place that decides "which
 * model + which API key do I try next" for every LLM task in the app.
 *
 * Design goals (so it's trivial to adopt real/paid keys later):
 *  - You maintain only TWO secrets, both comma-separated for rotation:
 *      GOOGLE_GENERATIVE_AI_API_KEY=k1,k2,k3
 *      GROQ_API_KEY=g1,g2
 *  - The per-task fallback CHAINS live as code defaults below, each optionally
 *    overridable by a plain (unprefixed) env var — no secrets, no code changes:
 *      LLM_AGENT_CHAIN / LLM_UTILITY_CHAIN / LLM_INGEST_CHAIN
 *    written as "provider:model,provider:model,...".
 *  - Adding a new provider later = add its key env + list it in a chain.
 *
 * Rotation order (per the product decision): exhaust every non-cooled key on the
 * CURRENT model first, then advance to the next model in the chain (which may be
 * a different provider). A key that trips a rate limit is put on a short cooldown
 * so we stop hammering it.
 */

export type LlmTask = "agent" | "utility" | "ingest";

export interface LlmCandidate {
  provider: Provider;
  model: string;
}

/** Max total attempts (key×model) for one logical task call. */
export const MAX_LLM_ATTEMPTS = 5;

/** How long a rate-limited key is skipped before we try it again. */
const KEY_COOLDOWN_MS = 60_000;

/**
 * Default per-task chains. No preview models (they carry tighter limits and
 * 2-week deprecations). The agent leads with a full Flash for quality — key
 * rotation across comma-separated keys absorbs its lower RPD — then falls to the
 * high-headroom Lite, then cross-provider to Groq. Cheap/utility + ingestion
 * tasks live on Groq to keep them off the agent's Gemini quota.
 */
const DEFAULT_CHAINS: Record<LlmTask, LlmCandidate[]> = {
  agent: [
    { provider: "google", model: "gemini-3.5-flash" },
    { provider: "google", model: "gemini-3.1-flash-lite" },
    { provider: "google", model: "gemini-2.5-flash" },
    { provider: "groq", model: "llama-3.3-70b-versatile" },
  ],
  utility: [
    { provider: "groq", model: "openai/gpt-oss-120b" },
    { provider: "groq", model: "llama-3.1-8b-instant" },
    { provider: "google", model: "gemini-3.1-flash-lite" },
  ],
  ingest: [
    { provider: "groq", model: "openai/gpt-oss-120b" },
    { provider: "groq", model: "llama-3.3-70b-versatile" },
    { provider: "google", model: "gemini-3.1-flash-lite" },
  ],
};

const CHAIN_ENV_VAR: Record<LlmTask, string> = {
  agent: "LLM_AGENT_CHAIN",
  utility: "LLM_UTILITY_CHAIN",
  ingest: "LLM_INGEST_CHAIN",
};

function isProvider(value: string): value is Provider {
  return (LLM_PROVIDER_IDS as readonly string[]).includes(value);
}

/** Parse "provider:model,provider:model" — split on the FIRST colon only. */
export function parseChain(raw: string | undefined | null): LlmCandidate[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((token) => token.trim())
    .filter(Boolean)
    .map((token) => {
      const idx = token.indexOf(":");
      if (idx <= 0) return null;
      const provider = token.slice(0, idx).trim();
      const model = token.slice(idx + 1).trim();
      if (!model || !isProvider(provider)) return null;
      return { provider, model } satisfies LlmCandidate;
    })
    .filter((c): c is LlmCandidate => c !== null);
}

function dedupe(candidates: LlmCandidate[]): LlmCandidate[] {
  const seen = new Set<string>();
  const out: LlmCandidate[] = [];
  for (const candidate of candidates) {
    const key = `${candidate.provider}:${candidate.model}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(candidate);
  }
  return out;
}

/**
 * Resolve the ordered candidate chain for a task. An optional `preferred`
 * (e.g. the legacy QUERYWISE_LLM_PROVIDER/MODEL) is placed first so existing
 * config still steers the primary; the env override (if set) replaces the
 * default tail.
 */
export function resolveTaskChain(task: LlmTask, preferred?: LlmCandidate | null): LlmCandidate[] {
  const override = parseChain(process.env[CHAIN_ENV_VAR[task]]);
  const base = override.length > 0 ? override : DEFAULT_CHAINS[task];
  return dedupe([...(preferred ? [preferred] : []), ...base]);
}

/** Non-throwing key lookup (returns [] when a provider has no keys configured). */
export function resolveKeysFor(provider: Provider): string[] {
  let raw: string | undefined;
  if (provider === "groq") raw = process.env.GROQ_API_KEY;
  else if (provider === "google")
    raw = process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? process.env.QUERYWISE_INGESTION_LLM_API_KEY;
  else if (provider === "anthropic") raw = process.env.ANTHROPIC_API_KEY;
  return (raw ?? "")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);
}

/* ------------------------------ key cooldown ------------------------------ */

const cooldownUntil = new Map<string, number>();

function keyId(provider: Provider, apiKey: string): string {
  return `${provider}:${createHash("sha256").update(apiKey).digest("hex").slice(0, 12)}`;
}

export function isKeyCooled(provider: Provider, apiKey: string): boolean {
  const until = cooldownUntil.get(keyId(provider, apiKey));
  return until !== undefined && Date.now() < until;
}

export function markKeyCooled(provider: Provider, apiKey: string, ms: number = KEY_COOLDOWN_MS): void {
  cooldownUntil.set(keyId(provider, apiKey), Date.now() + ms);
}

/** True when the error looks like a rate limit (429 / Groq TPM-413 / RPM). */
export function isRateLimitError(error: unknown): boolean {
  const status = (error as { statusCode?: number; status?: number } | null)?.statusCode
    ?? (error as { status?: number } | null)?.status;
  if (status === 429) return true;
  const message = (error instanceof Error ? error.message : String(error ?? "")).toLowerCase();
  return (
    message.includes("rate limit") ||
    message.includes("tokens per minute") ||
    message.includes("requests per minute") ||
    message.includes("tpm") ||
    message.includes("rpm") ||
    message.includes("quota") ||
    message.includes("resource_exhausted")
  );
}

/* ------------------------------ attempt plan ------------------------------ */

export interface RoutedAttempt {
  provider: Provider;
  model: string;
  apiKey: string;
}

/**
 * Flatten a chain into the ordered list of (model, key) attempts: every
 * non-cooled key of a model before advancing to the next model. Providers with
 * no keys are skipped entirely.
 */
export function planAttempts(chain: LlmCandidate[]): RoutedAttempt[] {
  const attempts: RoutedAttempt[] = [];
  const cooled: RoutedAttempt[] = [];
  for (const candidate of chain) {
    const keys = resolveKeysFor(candidate.provider);
    for (const apiKey of keys) {
      const attempt = { provider: candidate.provider, model: candidate.model, apiKey };
      if (isKeyCooled(candidate.provider, apiKey)) cooled.push(attempt);
      else attempts.push(attempt);
    }
  }
  // Cooled keys are still valid last resorts if everything fresh is exhausted.
  return [...attempts, ...cooled];
}

export interface AttemptInfo {
  attempt: number;
  max: number;
  provider: Provider;
  model: string;
}

/**
 * Run a task through its chain with key rotation, cooldown, and cross-provider
 * fallback, capped at MAX_LLM_ATTEMPTS. `onAttempt` fires before each try so the
 * UI can surface "Retrying (2/5)". Auth errors never rotate/retry.
 */
export async function runRoutedTask<T>(params: {
  task: LlmTask;
  preferred?: LlmCandidate | null;
  execute: (attempt: RoutedAttempt) => Promise<T>;
  onAttempt?: (info: AttemptInfo) => void;
}): Promise<T> {
  const chain = resolveTaskChain(params.task, params.preferred);
  const plan = planAttempts(chain).slice(0, MAX_LLM_ATTEMPTS);
  if (plan.length === 0) {
    throw new Error(
      `No API keys configured for the ${params.task} model chain. Set GOOGLE_GENERATIVE_AI_API_KEY and/or GROQ_API_KEY.`,
    );
  }

  const max = plan.length;
  let lastError: unknown;
  for (let i = 0; i < plan.length; i += 1) {
    const attempt = plan[i];
    params.onAttempt?.({ attempt: i + 1, max, provider: attempt.provider, model: attempt.model });
    try {
      return await params.execute(attempt);
    } catch (error) {
      lastError = error;
      if (isAuthError(error)) continue; // bad key — skip it, don't cooldown/retry-backoff
      if (isRateLimitError(error)) markKeyCooled(attempt.provider, attempt.apiKey);
      const isLast = i === plan.length - 1;
      if (isLast) break;
      // Stop early only on non-recoverable, non-fallback errors.
      if (!isRetryableError(error) && !shouldFallbackToAnotherModel(error)) throw error;
      if (isRateLimitError(error)) continue; // rotate immediately, no backoff
      await sleep(Math.min(2000, 300 * (i + 1)));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`LLM task "${params.task}" failed`);
}
