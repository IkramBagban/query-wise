import { z } from "zod";
import type { NextRequest } from "next/server";

import { resolveChartConfig } from "@/lib/charts";
import { executeQuery, validateAndSanitizeSql } from "@/lib/db";
import { LLM_PROVIDER_IDS } from "@/lib/llm-config";
import { generateSQL, runConstrainedAnalystAgent } from "@/lib/llm";
import { introspectSchema } from "@/lib/schema";
import { requireAuth } from "@/lib/auth";
import { logEvent } from "@/lib/logger";
import type { QueryResponse, SchemaInfo } from "@/types";

export const runtime = "nodejs";

const QueryRequestSchema = z.object({
  question: z.string().trim().min(1).max(500),
  history: z
    .array(
      z
        .object({
          id: z.string().min(1),
          role: z.enum(["user", "assistant"]),
          content: z.string(),
          sql: z.string().optional(),
          timestamp: z.number().int(),
        })
        .passthrough(),
  )
  .max(100),
  connectionString: z.string().trim().min(1).optional(),
  provider: z.enum(LLM_PROVIDER_IDS),
  model: z.string().trim().min(1).max(120),
  apiKey: z.string().trim().min(1),
});

const schemaCache = new Map<string, { schema: SchemaInfo; cachedAt: number }>();
const CACHE_TTL = 20 * 60 * 1000;

type StreamEvent =
  | "stage"
  | "text_delta"
  | "sql"
  | "query_stats"
  | "final"
  | "error";

type StreamEmitter = (event: StreamEvent, data: unknown) => void;

async function getCachedSchema(connectionString?: string): Promise<SchemaInfo> {
  const key = connectionString ?? "demo";
  const cached = schemaCache.get(key);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL) {
    return cached.schema;
  }

  const schema = await introspectSchema(connectionString);
  schemaCache.set(key, { schema, cachedAt: Date.now() });
  return schema;
}

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
    if (typeof candidate.responseBody === "string" && candidate.responseBody.trim()) {
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

function toUserFriendlyMessage(error: unknown): string {
  const statusCode = statusFromError(error);
  const errorText = collectErrorText(error);

  const isDatabaseAuthError =
    errorText.includes("password authentication failed for user") ||
    errorText.includes("authentication failed for user") ||
    errorText.includes("no pg_hba.conf entry") ||
    errorText.includes("sqlstate 28p01") ||
    errorText.includes("\"code\":\"28p01\"");
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

async function executeQueryFlow(
  input: z.infer<typeof QueryRequestSchema>,
  emit?: StreamEmitter,
): Promise<QueryResponse> {
  const { question, history, connectionString, provider, model, apiKey } = input;

  emit?.("stage", { label: "Analyzing request" });
  logEvent({
    type: "USER_QUERY",
    timestamp: new Date().toISOString(),
    message: question,
    meta: { history, connectionString, provider, model },
  });

  const schema = await getCachedSchema(connectionString);
  emit?.("stage", { label: "Preparing schema context" });

  const agentTurn = await runConstrainedAnalystAgent({
    question,
    history,
    schema,
    provider,
    model,
    apiKey,
    onTextDelta: (chunk) => {
      emit?.("text_delta", { chunk });
    },
    onStage: (label) => {
      emit?.("stage", { label });
    },
    executeQueryTool: async (toolQuestion) => {
      try {
        const sql = await generateSQL({
          question: toolQuestion,
          schema,
          history,
          provider,
          model,
          apiKey,
        });

        logEvent({
          type: "LLM_RESPONSE",
          timestamp: new Date().toISOString(),
          message: sql,
          meta: { tool: "execute_query", question: toolQuestion, model },
        });

        emit?.("sql", { sql });

        const validation = validateAndSanitizeSql(sql);
        if (!validation.valid) {
          throw new Error(validation.reason ?? "Query blocked");
        }

        emit?.("stage", { label: "Executing SQL" });
        const result = await executeQuery(sql, connectionString);

        emit?.("query_stats", {
          rowCount: result.rowCount,
          executionTimeMs: result.executionTimeMs,
        });

        logEvent({
          type: "SQL_QUERY",
          timestamp: new Date().toISOString(),
          message: sql,
          meta: { connectionString, model, rowCount: result.rowCount },
        });

        return {
          sql,
          columns: result.columns,
          rows: result.rows,
          rowCount: result.rowCount,
          executionTimeMs: result.executionTimeMs,
        };
      } catch (error) {
        logEvent({
          type: "ERROR",
          timestamp: new Date().toISOString(),
          message: error instanceof Error ? error.message : String(error),
          meta: {
            stack: error instanceof Error ? error.stack : undefined,
            tool: "execute_query",
            toolQuestion,
          },
        });
        throw error;
      }
    },
  });

  logEvent({
    type: "LLM_RESPONSE",
    timestamp: new Date().toISOString(),
    message: agentTurn.explanation,
    meta: { mode: agentTurn.mode, chartHint: agentTurn.chartHint },
  });

  if (agentTurn.mode === "query" && agentTurn.toolResult) {
    emit?.("stage", { label: "Selecting chart" });

    const finalResult = {
      columns: agentTurn.toolResult.columns,
      rows: agentTurn.toolResult.rows,
      rowCount: agentTurn.toolResult.rowCount,
      executionTimeMs: agentTurn.toolResult.executionTimeMs,
    };

    const chartConfig = resolveChartConfig(finalResult, agentTurn.chartHint);

    logEvent({
      type: "CHART_RENDER",
      timestamp: new Date().toISOString(),
      message: chartConfig.type,
      meta: { chartConfig, chartHint: agentTurn.chartHint },
    });

    const response: QueryResponse = {
      mode: "query",
      explanation: agentTurn.explanation,
      sql: agentTurn.toolResult.sql,
      result: finalResult,
      chartConfig,
    };

    logEvent({
      type: "INFO",
      timestamp: new Date().toISOString(),
      message: "Query completed",
      meta: {
        question,
        sql: agentTurn.toolResult.sql,
        chartType: chartConfig.type,
        rowCount: finalResult.rowCount,
      },
    });

    return response;
  }

  const response: QueryResponse = {
    mode: "conversation",
    explanation: agentTurn.explanation,
  };

  logEvent({
    type: "INFO",
    timestamp: new Date().toISOString(),
    message: "Conversation response (no SQL execution)",
    meta: { question },
  });

  return response;
}

function sseResponse(execute: (emit: StreamEmitter) => Promise<void>): Response {
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const emit: StreamEmitter = (event, data) => {
        const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
        controller.enqueue(encoder.encode(payload));
      };

      void (async () => {
        try {
          await execute(emit);
        } catch (error) {
          emit("error", { message: toUserFriendlyMessage(error) });
        } finally {
          controller.close();
        }
      })();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

export async function POST(req: NextRequest) {
  const authError = await requireAuth();
  if (authError) return authError;

  const body = await req.json().catch(() => null);
  const parsed = QueryRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }

  const wantsSse = req.headers.get("accept")?.includes("text/event-stream");

  if (wantsSse) {
    return sseResponse(async (emit) => {
      try {
        const response = await executeQueryFlow(parsed.data, emit);
        emit("final", response);
      } catch (error) {
        logEvent({
          type: "ERROR",
          timestamp: new Date().toISOString(),
          message: error instanceof Error ? error.message : String(error),
          meta: { stack: error instanceof Error ? error.stack : undefined },
        });
        throw error;
      }
    });
  }

  try {
    const response = await executeQueryFlow(parsed.data);
    return Response.json(response);
  } catch (error) {
    logEvent({
      type: "ERROR",
      timestamp: new Date().toISOString(),
      message: error instanceof Error ? error.message : String(error),
      meta: { stack: error instanceof Error ? error.stack : undefined },
    });
    console.error("[api/query]", error);
    return Response.json(
      { error: toUserFriendlyMessage(error) },
      { status: 500 },
    );
  }
}
