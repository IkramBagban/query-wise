import "server-only";
import { AppError } from "@query-wise/shared/dal/core";
import { getStatusCode, getErrorMessage, isAuthError } from "@/lib/llm/client";

/**
 * Maps raw backend errors (AI SDK, network, DB, etc.) into user-friendly
 * error codes and messages suitable for display in the chat UI.
 *
 * The returned `message` is always safe to show to end-users — no stack
 * traces, API keys, or internal details leak through.
 */
export function toUserFacingError(error: unknown): { code: string; message: string } {
  // Already an AppError with a known code — pass through as-is.
  if (error instanceof AppError) {
    return { code: error.code, message: error.message };
  }

  const message = getErrorMessage(error);
  const statusCode = extractDeepStatusCode(error);
  const lowerMessage = message.toLowerCase();

  // ── Auth / API key errors ──────────────────────────────────────────
  if (isAuthError(error)) {
    return {
      code: "AUTH_ERROR",
      message: "Your AI provider API key is invalid or missing. Please check your configuration.",
    };
  }

  // ── Rate limiting (429) ────────────────────────────────────────────
  if (statusCode === 429 || lowerMessage.includes("rate limit") || lowerMessage.includes("quota")) {
    const retrySeconds = extractRetryDelay(message);
    const retryHint = retrySeconds
      ? ` Please try again in about ${Math.ceil(retrySeconds)} seconds.`
      : " Please wait a moment and try again.";
    return {
      code: "RATE_LIMITED",
      message: `The AI model is temporarily rate-limited.${retryHint}`,
    };
  }

  // ── Model overloaded / unavailable (503) ───────────────────────────
  if (
    statusCode === 503 ||
    lowerMessage.includes("overloaded") ||
    lowerMessage.includes("high demand") ||
    lowerMessage.includes("unavailable") ||
    lowerMessage.includes("capacity")
  ) {
    return {
      code: "MODEL_UNAVAILABLE",
      message: "The AI model is currently experiencing high demand. Please try again in a moment.",
    };
  }

  // ── Model not found / unsupported ──────────────────────────────────
  if (
    statusCode === 404 ||
    lowerMessage.includes("model not found") ||
    lowerMessage.includes("not found") ||
    lowerMessage.includes("unsupported") ||
    lowerMessage.includes("deprecated")
  ) {
    return {
      code: "MODEL_NOT_FOUND",
      message: "The configured AI model could not be found. Please check your model settings.",
    };
  }

  // ── Request too large (413) ────────────────────────────────────────
  if (statusCode === 413 || lowerMessage.includes("too large") || lowerMessage.includes("context length")) {
    return {
      code: "CONTEXT_TOO_LARGE",
      message: "Your query produced too much context for the AI model. Try simplifying your question or starting a new conversation.",
    };
  }

  // ── Timeout ────────────────────────────────────────────────────────
  if (
    lowerMessage.includes("timeout") ||
    lowerMessage.includes("timed out") ||
    lowerMessage.includes("deadline exceeded") ||
    statusCode === 504 ||
    statusCode === 408
  ) {
    return {
      code: "TIMEOUT",
      message: "The request timed out. This can happen with complex queries — please try again.",
    };
  }

  // ── Network errors ─────────────────────────────────────────────────
  if (
    lowerMessage.includes("econnrefused") ||
    lowerMessage.includes("enotfound") ||
    lowerMessage.includes("network") ||
    lowerMessage.includes("fetch failed") ||
    lowerMessage.includes("socket hang up")
  ) {
    return {
      code: "NETWORK_ERROR",
      message: "Could not reach the AI provider. Please check your internet connection and try again.",
    };
  }

  // ── Aborted / cancelled ────────────────────────────────────────────
  if (lowerMessage.includes("aborted") || lowerMessage.includes("cancelled") || lowerMessage.includes("cancel")) {
    return {
      code: "CANCELLED",
      message: "The query was cancelled.",
    };
  }

  // ── Server errors (5xx) ────────────────────────────────────────────
  if (statusCode !== null && statusCode >= 500) {
    return {
      code: "PROVIDER_ERROR",
      message: "The AI provider returned a server error. Please try again in a moment.",
    };
  }

  // ── Fallback ───────────────────────────────────────────────────────
  return {
    code: "INTERNAL_ERROR",
    message: "Something went wrong while processing your query. Please try again.",
  };
}

/**
 * Extracts the deepest HTTP status code from an error chain.
 * AI SDK wraps errors: AI_RetryError → AI_APICallError (with statusCode).
 * We dig through `lastError`, `cause`, and `errors[]` to find it.
 */
function extractDeepStatusCode(error: unknown): number | null {
  if (!error || typeof error !== "object") return null;

  // Direct status code on this error
  const direct = getStatusCode(error);
  if (direct !== null) return direct;

  // AI_RetryError exposes `lastError`
  const asRetry = error as { lastError?: unknown; errors?: unknown[] };
  if (asRetry.lastError) {
    const nested = getStatusCode(asRetry.lastError);
    if (nested !== null) return nested;
  }

  // Walk `errors` array (AI SDK retries)
  if (Array.isArray(asRetry.errors)) {
    for (const inner of asRetry.errors) {
      const nested = getStatusCode(inner);
      if (nested !== null) return nested;
    }
  }

  // Standard `cause` chain
  const asCause = error as { cause?: unknown };
  if (asCause.cause) {
    return extractDeepStatusCode(asCause.cause);
  }

  return null;
}

/**
 * Tries to extract a retry delay from error messages like
 * "Please retry in 37.431726653s." → 37.431726653
 */
function extractRetryDelay(message: string): number | null {
  const match = message.match(/retry\s+in\s+([\d.]+)\s*s/i);
  if (match) {
    const seconds = parseFloat(match[1]);
    if (!isNaN(seconds) && seconds > 0) return seconds;
  }
  return null;
}
