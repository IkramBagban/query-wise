import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";

import {
  LLM_MODEL_CATALOG,
  SUPPORTED_MODELS_BY_PROVIDER,
  type LlmProvider,
} from "@/lib/llm-config";
import { sleep } from "../utils";

export type Provider = LlmProvider;

export const SUPPORTED_MODELS = LLM_MODEL_CATALOG;

const PROVIDER_MODELS: Record<Provider, string[]> = {
  google: [...SUPPORTED_MODELS_BY_PROVIDER.google],
  anthropic: [...SUPPORTED_MODELS_BY_PROVIDER.anthropic],
};

export function getModel(provider: Provider, model: string, apiKey: string) {
  if (provider === "google") {
    return createGoogleGenerativeAI({ apiKey })(model);
  }
  return createAnthropic({ apiKey })(model);
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
    message.includes("deprecated")
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
  fn: () => Promise<T>,
  maxAttempts = 3,
): Promise<T> {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      if (!isRetryableError(error) || attempt === maxAttempts) {
        throw error;
      }
      await sleep(Math.pow(2, attempt) * 500);
    }
  }
  throw new Error("Unreachable");
}

export async function withModelFallback<T>(params: {
  provider: Provider;
  model: string;
  execute: (model: string) => Promise<T>;
}): Promise<T> {
  const candidates = getModelCandidates(params.provider, params.model);
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
