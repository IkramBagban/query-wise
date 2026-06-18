import type { ApiErrorResponse, ApiSuccess } from "@/types/v2";

export class V2ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    readonly retryable = false,
    readonly requiresPassword = false,
  ) {
    super(message);
    this.name = "V2ApiError";
  }
}

export interface ApiRequestOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
  query?: Record<string, string | number | boolean | null | undefined>;
}

const inFlightGetRequests = new Map<string, Promise<unknown>>();

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
  const url = buildUrl(path, query);
  const method = (init.method ?? "GET").toUpperCase();
  const request = async () => {
    const response = await fetch(url, {
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
        error?.requiresPassword ?? false,
      );
    }

    if (payload && typeof payload === "object" && "data" in payload) {
      return (payload as ApiSuccess<T>).data;
    }
    return payload as T;
  };

  if (method !== "GET" || body !== undefined) return request();

  const existing = inFlightGetRequests.get(url) as Promise<T> | undefined;
  if (existing) return existing;

  const pending = request().finally(() => {
    if (inFlightGetRequests.get(url) === pending) inFlightGetRequests.delete(url);
  });
  inFlightGetRequests.set(url, pending);
  return pending;
}

export function createIdempotencyKey() {
  return crypto.randomUUID();
}
