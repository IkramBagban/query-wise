import type { ApiErrorResponse, ApiSuccess } from "@/types/v2";

export class V2ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    readonly retryable = false,
  ) {
    super(message);
    this.name = "V2ApiError";
  }
}

export interface ApiRequestOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
  query?: Record<string, string | number | boolean | null | undefined>;
}

function buildUrl(path: string, query?: ApiRequestOptions["query"]) {
  if (!query) return path;
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null) search.set(key, String(value));
  }
  const suffix = search.toString();
  return suffix ? `${path}?${suffix}` : path;
}

export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const { body, headers, query, ...init } = options;
  const response = await fetch(buildUrl(path, query), {
    cache: "no-store",
    ...init,
    headers: {
      Accept: "application/json",
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (response.status === 204) return undefined as T;
  const payload = (await response.json().catch(() => null)) as
    | ApiSuccess<T>
    | ApiErrorResponse
    | T
    | null;

  if (!response.ok) {
    const error = payload && typeof payload === "object" && "error" in payload
      ? (payload as ApiErrorResponse).error
      : null;
    throw new V2ApiError(
      error?.message ?? `Request failed with status ${response.status}`,
      response.status,
      error?.code,
      error?.retryable,
    );
  }

  if (payload && typeof payload === "object" && "data" in payload) {
    return (payload as ApiSuccess<T>).data;
  }
  return payload as T;
}

export function createIdempotencyKey() {
  return crypto.randomUUID();
}
