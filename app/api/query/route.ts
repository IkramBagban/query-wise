import { z } from "zod";
import type { NextRequest } from "next/server";

import { resolveChartConfig } from "@/lib/charts";
import { executeQuery, validateAndSanitizeSql } from "@/lib/db";
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
  provider: z.enum(["google", "anthropic"]),
  model: z.string().trim().min(1).max(120),
  apiKey: z.string().trim().min(1),
});

const schemaCache = new Map<string, { schema: SchemaInfo; cachedAt: number }>();
const CACHE_TTL = 5 * 60 * 1000;

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

function statusFromError(error: unknown): number | null {
  if (!error || typeof error !== "object") return null;
  const candidate = error as { statusCode?: unknown; status?: unknown };
  if (typeof candidate.statusCode === "number") return candidate.statusCode;
  if (typeof candidate.status === "number") return candidate.status;
  return null;
}

function toUserFriendlyMessage(error: unknown): string {
  const statusCode = statusFromError(error);
  if (statusCode === 401) {
    return "Invalid API key. Please check your settings.";
  }
  if (statusCode === 429) {
    return "Rate limit reached. Please wait a moment and try again.";
  }

  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return "Unknown error.";
}

export async function POST(req: NextRequest) {
  const authError = await requireAuth();
  if (authError) return authError;

  const body = await req.json().catch(() => null);
  const parsed = QueryRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }

  const { question, history, connectionString, provider, model, apiKey } = parsed.data;

  logEvent({
    type: "USER_QUERY",
    timestamp: new Date().toISOString(),
    message: question,
    meta: { history, connectionString, provider, model },
  });

  try {
    const schema = await getCachedSchema(connectionString);

    const agentTurn = await runConstrainedAnalystAgent({
      question,
      history,
      schema,
      provider,
      model,
      apiKey,
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

          const validation = validateAndSanitizeSql(sql);
          if (!validation.valid) {
            throw new Error(validation.reason ?? "Query blocked");
          }

          const result = await executeQuery(sql, connectionString);

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

      return Response.json(response);
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
