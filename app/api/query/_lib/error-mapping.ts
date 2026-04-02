function getErrorChain(error: unknown, maxDepth = 8): unknown[] {
  const chain: unknown[] = [];
  let current: unknown = error;
  let depth = 0;

  while (current && depth < maxDepth) {
    chain.push(current);
    if (!current || typeof current !== "object") break;
    const next = (current as { cause?: unknown }).cause;
    if (!next || next === current) break;
    current = next;
    depth += 1;
  }

  return chain;
}

function safeStringify(value: unknown): string {
  const seen = new WeakSet<object>();
  return JSON.stringify(value, (_key, nested) => {
    if (nested && typeof nested === "object") {
      if (seen.has(nested)) {
        return "[Circular]";
      }
      seen.add(nested);
    }
    return nested;
  });
}

function statusFromError(error: unknown): number | null {
  const chain = getErrorChain(error);
  for (const item of chain) {
    if (!item || typeof item !== "object") continue;
    const candidate = item as { statusCode?: unknown; status?: unknown };
    if (typeof candidate.statusCode === "number") return candidate.statusCode;
    if (typeof candidate.status === "number") return candidate.status;
  }
  return null;
}

function collectErrorText(error: unknown): string {
  const chain = getErrorChain(error);
  const parts: string[] = [];

  for (const item of chain) {
    if (!item || typeof item !== "object") continue;
    const candidate = item as {
      message?: unknown;
      responseBody?: unknown;
      data?: unknown;
    };

    if (typeof candidate.message === "string" && candidate.message.trim()) {
      parts.push(candidate.message.toLowerCase());
    }
    if (
      typeof candidate.responseBody === "string" &&
      candidate.responseBody.trim()
    ) {
      parts.push(candidate.responseBody.toLowerCase());
    }
    if (candidate.data) {
      try {
        parts.push(JSON.stringify(candidate.data).toLowerCase());
      } catch {
        // ignore JSON serialization failures
      }
    }

    try {
      parts.push(safeStringify(item).toLowerCase());
    } catch {
      // ignore serialization failures
    }
  }

  return parts.join(" | ");
}

export function toUserFriendlyMessage(error: unknown): string {
  const statusCode = statusFromError(error);
  const errorText = collectErrorText(error);

  const isDatabaseAuthError =
    errorText.includes("password authentication failed for user") ||
    errorText.includes("authentication failed for user") ||
    errorText.includes("no pg_hba.conf entry") ||
    errorText.includes("sqlstate 28p01") ||
    errorText.includes('"code":"28p01"');
  if (isDatabaseAuthError) {
    return "Database authentication failed. Please check your database credentials in connection settings.";
  }

  const providerAuthSignal =
    errorText.includes("googleapis.com") ||
    errorText.includes("anthropic") ||
    errorText.includes("generativelanguage.googleapis.com") ||
    errorText.includes("api key");

  const isSessionAuthError =
    (statusCode === 401 || statusCode === 403) && !providerAuthSignal;
  if (isSessionAuthError) {
    return "Your session expired. Please sign in again.";
  }

  const isInvalidApiKey =
    ((statusCode === 401 || statusCode === 403) && providerAuthSignal) ||
    errorText.includes("api_key_invalid") ||
    errorText.includes("invalid api key") ||
    errorText.includes("api key not valid") ||
    errorText.includes("please pass a valid api key") ||
    (errorText.includes("authentication") && providerAuthSignal);
  if (isInvalidApiKey) {
    return "Invalid API key. Please check your settings.";
  }

  const isRateLimited =
    statusCode === 429 ||
    errorText.includes("rate limit") ||
    errorText.includes("quota");
  if (isRateLimited) {
    return "Rate limit reached. Please wait a moment and try again.";
  }

  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return "Unknown error.";
}

export function isStructuredOutputParseFailure(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return (
    message.includes("no object generated") ||
    message.includes("could not parse the response") ||
    message.includes("could not parse response")
  );
}
