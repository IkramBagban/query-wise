import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createGroq } from "@ai-sdk/groq";

import {
  DEFAULT_LLM_MODEL,
  DEFAULT_LLM_PROVIDER,
  SUPPORTED_MODELS_BY_PROVIDER,
  type LlmProvider,
} from "@/lib/llm-config";
import { sleep } from "../utils";

export type Provider = LlmProvider;

const PROVIDER_MODELS: Record<Provider, string[]> = {
  groq: [...SUPPORTED_MODELS_BY_PROVIDER.groq],
  google: [...SUPPORTED_MODELS_BY_PROVIDER.google],
  anthropic: [...SUPPORTED_MODELS_BY_PROVIDER.anthropic],
};

export interface BackendLlmConfig {
  provider: Provider;
  model: string;
  apiKeys: string[];
}

/**
 * Resolves the LLM configuration from server-side environment variables.
 * Provider, model, and API key are never accepted from the client.
 */
export function getBackendLlmConfig(): BackendLlmConfig {
  const provider = (process.env.QUERYWISE_LLM_PROVIDER ?? DEFAULT_LLM_PROVIDER) as Provider;
  const model = process.env.QUERYWISE_LLM_MODEL ?? DEFAULT_LLM_MODEL;
  const apiKeys = resolveApiKey(provider);
  return { provider, model, apiKeys };
}

function resolveApiKey(provider: Provider): string[] {
  let rawKey: string | undefined;
  if (provider === "groq") {
    rawKey = process.env.GROQ_API_KEY;
    if (!rawKey) throw new Error("GROQ_API_KEY environment variable is not set.");
  } else if (provider === "google") {
    rawKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? process.env.QUERYWISE_INGESTION_LLM_API_KEY;
    if (!rawKey) throw new Error("GOOGLE_GENERATIVE_AI_API_KEY environment variable is not set.");
  } else if (provider === "anthropic") {
    rawKey = process.env.ANTHROPIC_API_KEY;
    if (!rawKey) throw new Error("ANTHROPIC_API_KEY environment variable is not set.");
  } else {
    throw new Error(`Unknown LLM provider: ${provider}`);
  }

  const keys = rawKey.split(",").map((k) => k.trim()).filter(Boolean);
  if (keys.length === 0) throw new Error(`No valid API keys found for provider: ${provider}`);
  
  return keys;
}

export function getModel(provider: Provider, model: string, apiKey: string) {
  if (provider === "groq") {
    // @ts-ignore: parallelToolCalls is supported in settings but may lack typings in this version
    return createGroq({ apiKey })(model, { parallelToolCalls: false });
  }
  if (provider === "google") {
    return createGoogleGenerativeAI({ apiKey })(model);
  }
  return createAnthropic({ apiKey })(model);
}

/**
 * Dynamic-thinking provider options for the agent loop. `thinkingBudget: -1`
 * lets Gemini 2.5/3 decide how much to reason per turn (down to zero on simple
 * questions) instead of a fixed budget, while `includeThoughts` surfaces the
 * thought summaries we stream to the UI. Keys are provider-scoped, so the AI
 * SDK ignores them for non-Google providers.
 */
export function getThinkingProviderOptions(provider: Provider) {
  if (provider === "google") {
    return {
      google: {
        thinkingConfig: { includeThoughts: true, thinkingBudget: -1 },
      },
    };
  }
  return undefined;
}

export function getStatusCode(error: unknown): number | null {
  if (!error || typeof error !== "object") return null;
  const withStatus = error as { statusCode?: unknown; status?: unknown };
  if (typeof withStatus.statusCode === "number") return withStatus.statusCode;
  if (typeof withStatus.status === "number") return withStatus.status;
  return null;
}

export function isRetryableError(error: unknown): boolean {
  const statusCode = getStatusCode(error);

  const message = getErrorMessage(error).toLowerCase();
  if (message.includes("tool call") || message.includes("invalid_request_error")) {
    return true;
  }

  // Groq TPM/RPM rate limits arrive as HTTP 413 (not 429) yet are transient:
  // treat the token-per-minute shape as retryable so the agent's key-rotation /
  // backoff loop kicks in instead of surfacing a false context overflow.
  if (
    message.includes("tokens per minute") ||
    message.includes("tpm") ||
    message.includes("requests per minute") ||
    message.includes("rpm") ||
    message.includes("rate limit")
  ) {
    return true;
  }

  if (statusCode === 401) return false;
  if (statusCode === 403) return false;
  if (statusCode === 429) return true;
  if (statusCode !== null) return statusCode >= 500;
  return true;
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "";
}

/**
 * True context overflow (prompt exceeds the model's working memory) — the
 * recoverable failure the context engine reacts to mid-run (SPEC-01 §1).
 * Excludes TPM-shaped 413s, which are transient rate limits handled by retry.
 */
export function isContextOverflowError(error: unknown): boolean {
  const message = getErrorMessage(error).toLowerCase();
  const isTpm =
    message.includes("tokens per minute") ||
    message.includes("tpm") ||
    message.includes("requests per minute") ||
    message.includes("rpm") ||
    message.includes("rate limit");
  if (isTpm) return false;

  if (
    message.includes("context length") ||
    message.includes("maximum context") ||
    message.includes("context_length_exceeded") ||
    message.includes("prompt is too long")
  ) {
    return true;
  }
  const statusCode = getStatusCode(error);
  if (statusCode === 413) return true;
  return message.includes("too large");
}

export function isAuthError(error: unknown): boolean {
  const statusCode = getStatusCode(error);
  if (statusCode === 401 || statusCode === 403) return true;

  const message = getErrorMessage(error).toLowerCase();
  return (
    message.includes("api_key_invalid") ||
    message.includes("invalid api key") ||
    message.includes("valid api key") ||
    message.includes("authentication") ||
    message.includes("unauthorized")
  );
}

export function shouldFallbackToAnotherModel(error: unknown): boolean {
  if (isAuthError(error)) return false;

  const statusCode = getStatusCode(error);
  if (statusCode === 429) return true;
  if (statusCode !== null && statusCode >= 500) return true;
  if (statusCode === 404) return true;

  const message = getErrorMessage(error).toLowerCase();
  return (
    message.includes("model") ||
    message.includes("not found") ||
    message.includes("unsupported") ||
    message.includes("unavailable") ||
    message.includes("overloaded") ||
    message.includes("capacity") ||
    message.includes("deprecated") ||
    message.includes("tool call") ||
    message.includes("invalid_request_error")
  );
}

export function getModelCandidates(
  provider: Provider,
  preferredModel: string,
): string[] {
  const providerModels = PROVIDER_MODELS[provider];
  const candidates = [preferredModel, ...providerModels];
  return [...new Set(candidates)];
}

export async function withRetry<T>(
  apiKeys: string[],
  fn: (apiKey: string) => Promise<T>,
  maxAttempts = 5,
): Promise<T> {
  const attempts = Math.max(maxAttempts, apiKeys.length);
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const apiKey = apiKeys[(attempt - 1) % apiKeys.length];
      return await fn(apiKey);
    } catch (error) {
      if (!isRetryableError(error) || attempt === attempts) {
        throw error;
      }
      if (getStatusCode(error) === 429 && apiKeys.length > 1) {
        continue;
      }
      await sleep(Math.pow(2, attempt) * 500);
    }
  }
  throw new Error("Unreachable");
}

export async function withModelFallback<T>(params: {
  provider: Provider;
  model: string;
  apiKeys: string[];
  execute: (model: string, apiKey: string) => Promise<T>;
}): Promise<T> {
  const candidates = getModelCandidates(params.provider, params.model);
  let lastError: unknown;

  for (const candidate of candidates) {
    try {
      return await withRetry(params.apiKeys, (apiKey) => params.execute(candidate, apiKey));
    } catch (error) {
      lastError = error;
      if (!shouldFallbackToAnotherModel(error)) {
        throw error;
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Model execution failed");
}
