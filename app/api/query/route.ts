import { z } from "zod";
import type { NextRequest } from "next/server";

import { resolveChartConfig } from "@/lib/charts";
import { executeQuery, validateAndSanitizeSql } from "@/lib/db";
import { generateChartHint, generateExplanation, generateSQL } from "@/lib/llm";
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

  const message =
    error instanceof Error ? error.message : "I couldn't process that query.";
  const normalized = message.toLowerCase();

  if (
    normalized.includes("safe query") ||
    normalized.includes("not allowed") ||
    normalized.includes("only select") ||
    normalized.includes("blocked")
  ) {
    return "I couldn't generate a safe query for that question. Try rephrasing.";
  }

  if (
    normalized.includes("statement timeout") ||
    normalized.includes("timeout") ||
    normalized.includes("timed out")
  ) {
    if (normalized.includes("connection timeout") || normalized.includes("connection terminated")) {
      return "Database connection timed out. Please try again in a few seconds.";
    }
    return "Query took too long to execute. Try a more specific question.";
  }

  return message;
}

function isBlockedQueryError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return message.includes("blocked keyword") || message.includes("only select queries are allowed");
}

function buildSafeRetryQuestion(question: string): string {
  return [
    question,
    "",
    "CRITICAL SQL SAFETY REQUIREMENTS:",
    "- Return exactly one PostgreSQL query.",
    "- Query must start with SELECT or WITH.",
    "- Do NOT use CREATE, INSERT, UPDATE, DELETE, DROP, ALTER, TRUNCATE, CALL, EXEC, GRANT, REVOKE.",
    "- Do NOT include markdown, comments, or explanations.",
  ].join("\n");
}

function buildStrictRetryQuestion(question: string): string {
  return [
    question,
    "",
    "HARD CONSTRAINTS:",
    "- Output one SQL statement only.",
    "- Must begin with SELECT or WITH.",
    "- Do not include CREATE/INSERT/UPDATE/DELETE/DROP/ALTER/TRUNCATE/GRANT/REVOKE/CALL/EXEC.",
    "- No comments and no markdown.",
    "- Prefer direct aggregation query over CTE if possible.",
  ].join("\n");
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
    meta: { history, connectionString, provider, model }
  });

  try {
    const schema = await getCachedSchema(connectionString);
    const attempts = [
      question,
      buildSafeRetryQuestion(question),
      buildStrictRetryQuestion(question),
    ];

    let sql = "";
    let result: Awaited<ReturnType<typeof executeQuery>> | null = null;
    let lastBlockedError: Error | null = null;

    const tryModel = async (modelName: string): Promise<boolean> => {
      for (const attemptQuestion of attempts) {
        sql = await generateSQL({
          question: attemptQuestion,
          schema,
          history,
          provider,
          model: modelName,
          apiKey,
        });

        logEvent({
          type: "LLM_RESPONSE",
          timestamp: new Date().toISOString(),
          message: sql,
          meta: { attemptQuestion, model: modelName }
        });

        const validation = validateAndSanitizeSql(sql);
        if (!validation.valid) {
          lastBlockedError = new Error(validation.reason ?? "Query blocked");
          continue;
        }

        try {
          result = await executeQuery(sql, connectionString);
          logEvent({
            type: "SQL_QUERY",
            timestamp: new Date().toISOString(),
            message: sql,
            meta: { connectionString, model: modelName }
          });
          return true;
        } catch (error) {
          if (!isBlockedQueryError(error)) {
            logEvent({
              type: "ERROR",
              timestamp: new Date().toISOString(),
              message: error instanceof Error ? error.message : String(error),
              meta: { stack: error instanceof Error ? error.stack : undefined, sql, model: modelName }
            });
            throw error;
          }
          lastBlockedError =
            error instanceof Error ? error : new Error("Query blocked");
        }
      }
      return false;
    };

    await tryModel(model);

    // Some models can occasionally return empty SQL; retry once with a stable Google fallback.
    const lastBlockedMessage =
      (lastBlockedError as { message?: string } | null)?.message ?? "";

    if (!result && provider === "google" && lastBlockedMessage === "Query is empty.") {
      const fallbackModel = model === "gemini-2.5-flash" ? "gemini-2.0-flash" : "gemini-2.5-flash";
      logEvent({
        type: "INFO",
        timestamp: new Date().toISOString(),
        message: "Retrying SQL generation with fallback model",
        meta: { fromModel: model, toModel: fallbackModel, reason: lastBlockedMessage }
      });
      await tryModel(fallbackModel);
    }

    if (!result) {
      const blockedError = lastBlockedError as Error | null;
      logEvent({
        type: "ERROR",
        timestamp: new Date().toISOString(),
        message: blockedError?.message || "No result after all attempts",
        meta: { question }
      });
      throw (
        blockedError ??
        new Error("I couldn't generate a safe query for that question. Try rephrasing.")
      );
    }
    const finalResult = result as Awaited<ReturnType<typeof executeQuery>>;

    let chartHint = null;
    try {
      chartHint = await generateChartHint({
        question,
        sql,
        result: finalResult,
        provider,
        model,
        apiKey,
      });
    } catch (err) {
      logEvent({
        type: "ERROR",
        timestamp: new Date().toISOString(),
        message: err instanceof Error ? err.message : String(err),
        meta: { chartHintFallback: true }
      });
    }

    const chartConfig = resolveChartConfig(finalResult, chartHint);
    logEvent({
      type: "CHART_RENDER",
      timestamp: new Date().toISOString(),
      message: chartConfig.type,
      meta: { chartConfig, chartHint }
    });

    let explanation = "";
    if (finalResult.rowCount === 0) {
      explanation = "No rows matched your question.";
    } else {
      try {
        explanation = await generateExplanation({
          question,
          sql,
          rowCount: finalResult.rowCount,
          provider,
          model,
          apiKey,
        });
        logEvent({
          type: "LLM_RESPONSE",
          timestamp: new Date().toISOString(),
          message: explanation,
          meta: { explanation }
        });
      } catch (err) {
        explanation = `Found ${finalResult.rowCount} result${finalResult.rowCount !== 1 ? "s" : ""}.`;
        logEvent({
          type: "ERROR",
          timestamp: new Date().toISOString(),
          message: err instanceof Error ? err.message : String(err),
          meta: { explanationFallback: true }
        });
      }
    }

    const response: QueryResponse = { sql, result: finalResult, chartConfig, explanation };
    logEvent({
      type: "INFO",
      timestamp: new Date().toISOString(),
      message: "Query completed",
      meta: { question, sql, chartType: chartConfig.type, rowCount: finalResult.rowCount }
    });
    return Response.json(response);
  } catch (error) {
    logEvent({
      type: "ERROR",
      timestamp: new Date().toISOString(),
      message: error instanceof Error ? error.message : String(error),
      meta: { stack: error instanceof Error ? error.stack : undefined }
    });
    console.error("[api/query]", error);
    return Response.json(
      { error: toUserFriendlyMessage(error) },
      { status: 500 },
    );
  }
}
