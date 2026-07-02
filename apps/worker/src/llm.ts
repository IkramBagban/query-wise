/**
 * Standalone LLM utilities for the ingestion worker.
 * Uses QUERYWISE_INGESTION_LLM_* env vars (separate from the web app's QUERYWISE_LLM_* vars).
 * Only google and anthropic providers are supported for ingestion.
 */

import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createGroq } from "@ai-sdk/groq";

export type Provider = "google" | "anthropic" | "groq";

export function getModel(provider: Provider, model: string, apiKey: string) {
  if (provider === "google") {
    return createGoogleGenerativeAI({ apiKey })(model);
  }
  if (provider === "groq") {
    return createGroq({ apiKey })(model);
  }
  return createAnthropic({ apiKey })(model);
}

function getStatusCode(error: unknown): number | null {
  if (!error || typeof error !== "object") return null;
  const withStatus = error as { statusCode?: unknown; status?: unknown };
  if (typeof withStatus.statusCode === "number") return withStatus.statusCode;
  if (typeof withStatus.status === "number") return withStatus.status;
  return null;
}

function isRetryableError(error: unknown): boolean {
  const statusCode = getStatusCode(error);
  if (statusCode === 401) return false;
  if (statusCode === 403) return false;
  if (statusCode === 429) return true;
  if (statusCode !== null) return statusCode >= 500;
  return true;
}

function shouldFallbackToAnotherModel(error: unknown): boolean {
  const statusCode = getStatusCode(error);
  if (statusCode === 401 || statusCode === 403) return false;
  if (statusCode === 429) return true;
  if (statusCode !== null && statusCode >= 500) return true;
  if (statusCode === 404) return true;

  const message =
    error instanceof Error ? error.message.toLowerCase() : "";
  return (
    message.includes("model") ||
    message.includes("not found") ||
    message.includes("unsupported") ||
    message.includes("unavailable") ||
    message.includes("overloaded") ||
    message.includes("capacity") ||
    message.includes("deprecated")
  );
}

const FALLBACK_MODELS: Record<Provider, string[]> = {
  google: ["gemini-2.0-flash"],
  anthropic: ["claude-3-5-haiku-latest", "claude-3-haiku-20240307"],
  groq: ["llama-3.1-8b-instant", "llama3-8b-8192"],
};

async function withRetry<T>(fn: () => Promise<T>, maxAttempts = 3): Promise<T> {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      if (!isRetryableError(error) || attempt === maxAttempts) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, Math.pow(2, attempt) * 500));
    }
  }
  throw new Error("Unreachable");
}

export async function withModelFallback<T>(params: {
  provider: Provider;
  model: string;
  execute: (model: string) => Promise<T>;
}): Promise<T> {
  const fallbacks = FALLBACK_MODELS[params.provider] ?? [];
  const candidates = [...new Set([params.model, ...fallbacks])];
  let lastError: unknown;

  for (const candidate of candidates) {
    try {
      return await withRetry(() => params.execute(candidate));
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
