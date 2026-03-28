import { z } from "zod";
import type { NextRequest } from "next/server";

import { detectChartConfig } from "@/lib/charts";
import { executeQuery } from "@/lib/db";
import { generateExplanation, generateSQL } from "@/lib/llm";
import { introspectSchema } from "@/lib/schema";
import { requireAuth } from "@/lib/auth";
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
    return "Query took too long to execute. Try a more specific question.";
  }

  return message;
}

export async function POST(req: NextRequest) {
  const authError = await requireAuth();
  if (authError) return authError;

  const body = await req.json().catch(() => null);
  const parsed = QueryRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }

  const { question, history, connectionString, provider, model, apiKey } =
    parsed.data;
    console.log("parseddata", parsed.data);

  try {
    const schema = await getCachedSchema(connectionString);
    const sql = await generateSQL({
      question,
      schema,
      history,
      provider,
      model,
      apiKey,
    });

    const result = await executeQuery(sql, connectionString);

    console.log("result", result);
    const chartConfig = detectChartConfig(result);
    console.log("chartConfig", chartConfig);

    let explanation = "";
    if (result.rowCount === 0) {
      explanation = "No rows matched your question.";
    } else {
      try {
        explanation = await generateExplanation({
          question,
          sql,
          rowCount: result.rowCount,
          provider,
          model,
          apiKey,
        });
      } catch {
        explanation = `Found ${result.rowCount} result${result.rowCount !== 1 ? "s" : ""}.`;
      }
    }

    const response: QueryResponse = { sql, result, chartConfig, explanation };
    return Response.json(response);
  } catch (error) {
    console.error("[api/query]", error);
    return Response.json(
      { error: toUserFriendlyMessage(error) },
      { status: 500 },
    );
  }
}
