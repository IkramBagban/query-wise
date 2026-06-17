import { apiRequest, createIdempotencyKey } from "./client";
import type {
  ConnectionDto,
  ConnectionListItem,
  ConversationMessageDto,
  ConversationDto,
  ConversationListItem,
  CreateConnectionInput,
  CursorPage,
  DashboardDto,
  DashboardListItem,
  PublicDashboardDto,
  QueryRunDto,
  QueryStreamEvent,
  SchemaDto,
  CreateShareInput,
  CreateShareResult,
  ShareCollection,
  ShareUnlockResult,
  SubmitQueryInput,
} from "./types";

const pageQuery = (limit = 25, cursor?: string) => ({ limit, cursor });

export const connectionsApi = {
  list: (limit = 25, cursor?: string) =>
    apiRequest<CursorPage<ConnectionListItem>>("/api/connections", { query: pageQuery(limit, cursor) }),
  get: (id: string) => apiRequest<ConnectionDto>(`/api/connections/${id}`),
  create: (input: CreateConnectionInput) =>
    apiRequest<ConnectionDto>("/api/connections", { method: "POST", body: input }),
  createDemo: () =>
    apiRequest<ConnectionDto>("/api/connections/demo", { method: "POST" }),
  update: (id: string, input: { name?: string; connectionString?: string }) =>
    apiRequest<ConnectionDto>(`/api/connections/${id}`, { method: "PATCH", body: input }),
  remove: (id: string) => apiRequest<void>(`/api/connections/${id}`, { method: "DELETE" }),
  test: (id: string) =>
    apiRequest<{ success: boolean; latencyMs?: number; errorCode?: string | null }>(
      `/api/connections/${id}/test`,
      { method: "POST", body: { idempotencyKey: createIdempotencyKey() } },
    ),
  schema: (id: string) => apiRequest<SchemaDto>(`/api/connections/${id}/schema`),
  refreshSchema: (id: string) =>
    apiRequest<{ status: string }>(`/api/connections/${id}/schema/refresh`, {
      method: "POST",
      body: { idempotencyKey: createIdempotencyKey() },
    }),
};

export const conversationsApi = {
  list: (limit = 25, cursor?: string) =>
    apiRequest<CursorPage<ConversationListItem>>("/api/conversations", { query: pageQuery(limit, cursor) }),
  get: (id: string) => apiRequest<ConversationDto>(`/api/conversations/${id}`),
  create: (connectionId: string) =>
    apiRequest<ConversationDto>("/api/conversations", { method: "POST", body: { connectionId } }),
  messages: (id: string, limit = 100, cursor?: string) =>
    apiRequest<CursorPage<ConversationMessageDto>>(`/api/conversations/${id}/messages`, {
      query: pageQuery(limit, cursor),
    }),
  submit: (input: Omit<SubmitQueryInput, "idempotencyKey">) =>
    apiRequest<QueryRunDto>("/api/query", {
      method: "POST",
      body: { ...input, idempotencyKey: createIdempotencyKey() },
    }),
  submitStream: (input: Omit<SubmitQueryInput, "idempotencyKey">, onEvent: (event: QueryStreamEvent) => void) =>
    streamQuerySubmission({ ...input, idempotencyKey: createIdempotencyKey() }, onEvent),
  queryRun: (id: string) => apiRequest<QueryRunDto>(`/api/query/${id}`),
};

async function streamQuerySubmission(input: SubmitQueryInput, onEvent: (event: QueryStreamEvent) => void) {
  const response = await fetch("/api/query", {
    method: "POST",
    cache: "no-store",
    headers: {
      Accept: "text/event-stream",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  if (!response.ok || !response.body) {
    const payload = await response.json().catch(() => null);
    const error = payload && typeof payload === "object" && "error" in payload
      ? (payload as { error?: { message?: string } }).error
      : null;
    throw new Error(error?.message ?? `Request failed with status ${response.status}`);
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("text/event-stream")) {
    const run = await response.json().catch(() => null) as QueryRunDto | null;
    if (run) {
      onEvent({
        contractVersion: "querywise.v2",
        queryRunId: run.id,
        sequence: 0,
        type: run.status === "failed" ? "failed" : "completed",
        occurredAt: new Date().toISOString(),
        data: { status: run.status, statusVersion: run.statusVersion },
      });
      return;
    }
    throw new Error("Expected a query event stream response.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split(/\n\n/);
    buffer = chunks.pop() ?? "";
    for (const chunk of chunks) {
      const dataLine = chunk.split(/\n/).find((line) => line.startsWith("data: "));
      if (!dataLine) continue;
      onEvent(JSON.parse(dataLine.slice(6)) as QueryStreamEvent);
    }
  }

  const trailing = buffer.trim();
  if (trailing) {
    const dataLine = trailing.split(/\n/).find((line) => line.startsWith("data: "));
    if (dataLine) onEvent(JSON.parse(dataLine.slice(6)) as QueryStreamEvent);
  }
}

export const dashboardsApi = {
  list: (limit = 25, cursor?: string) =>
    apiRequest<CursorPage<DashboardListItem>>("/api/dashboards", { query: pageQuery(limit, cursor) }),
  get: (id: string) => apiRequest<DashboardDto>(`/api/dashboards/${id}`),
  create: (name: string) => apiRequest<DashboardDto>("/api/dashboards", { method: "POST", body: { name } }),
  update: (id: string, name: string) =>
    apiRequest<{ id: string; updatedAt: string }>(`/api/dashboards/${id}`, {
      method: "PATCH",
      body: { name },
    }),
  remove: (id: string) => apiRequest<void>(`/api/dashboards/${id}`, { method: "DELETE" }),
  shares: (id: string) => apiRequest<ShareCollection>(`/api/dashboards/${id}/shares`),
  createShare: (id: string, input: CreateShareInput) =>
    apiRequest<CreateShareResult>(`/api/dashboards/${id}/shares`, {
      method: "POST",
      body: input,
    }),
  revokeShare: (dashboardId: string, shareId: string) =>
    apiRequest<void>(`/api/dashboards/${dashboardId}/shares/${shareId}`, { method: "DELETE" }),
  createWidget: (dashboardId: string, input: import("./types").CreateWidgetInput & { queryDefinition?: QueryRunDto["generatedQuery"] }) =>
    apiRequest<DashboardDto["widgets"][number]>(`/api/dashboards/${dashboardId}/widgets`, {
      method: "POST",
      body: input,
    }),
  updateWidget: (dashboardId: string, widgetId: string, input: Partial<import("./types").CreateWidgetInput>) =>
    apiRequest<DashboardDto["widgets"][number]>(`/api/dashboards/${dashboardId}/widgets/${widgetId}`, {
      method: "PATCH",
      body: input,
    }),
  removeWidget: (dashboardId: string, widgetId: string) =>
    apiRequest<void>(`/api/dashboards/${dashboardId}/widgets/${widgetId}`, { method: "DELETE" }),
};

export const publicSharesApi = {
  get: (token: string) => apiRequest<PublicDashboardDto>(`/api/public/shares/${token}`),
  unlock: (token: string, password: string) =>
    apiRequest<ShareUnlockResult>(`/api/public/shares/${token}/unlock`, {
      method: "POST",
      body: { password },
    }),
};
