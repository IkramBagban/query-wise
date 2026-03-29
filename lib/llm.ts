import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateText } from "ai";

import { sleep } from "@/lib/utils";
import type { ChartHint, ChatMessage, QueryResult, SchemaInfo } from "@/types";

type Provider = "google" | "anthropic";

export const SUPPORTED_MODELS = [
  {
    provider: "google",
    model: "gemini-3.1-pro-preview",
    label: "Gemini 3.1 Pro Preview",
    tier: "powerful",
  },
  {
    provider: "google",
    model: "gemini-3-flash-preview",
    label: "Gemini 3 Flash Preview",
    tier: "fast",
  },
  {
    provider: "google",
    model: "gemini-2.5-pro",
    label: "Gemini 2.5 Pro",
    tier: "powerful",
  },
  {
    provider: "google",
    model: "gemini-2.5-flash",
    label: "Gemini 2.5 Flash",
    tier: "fast",
  },
  {
    provider: "google",
    model: "gemini-2.5-flash-lite",
    label: "Gemini 2.5 Flash-Lite",
    tier: "fast",
  },
  {
    provider: "google",
    model: "gemini-2.0-flash",
    label: "Gemini 2.0 Flash",
    tier: "fast",
  },
  {
    provider: "google",
    model: "gemini-1.5-pro",
    label: "Gemini 1.5 Pro",
    tier: "powerful",
  },
  {
    provider: "google",
    model: "gemini-1.5-flash",
    label: "Gemini 1.5 Flash",
    tier: "fast",
  },
  {
    provider: "anthropic",
    model: "claude-sonnet-4-5",
    label: "Claude Sonnet",
    tier: "powerful",
  },
  {
    provider: "anthropic",
    model: "claude-haiku-4-5-20251001",
    label: "Claude Haiku",
    tier: "fast",
  },
] as const;

interface GenerateSQLParams {
  question: string;
  schema: SchemaInfo;
  history: ChatMessage[];
  provider: Provider;
  model: string;
  apiKey: string;
}

interface GenerateExplanationParams {
  question: string;
  sql: string;
  rowCount: number;
  provider: Provider;
  model: string;
  apiKey: string;
}

interface GenerateChartHintParams {
  question: string;
  sql: string;
  result: QueryResult;
  provider: Provider;
  model: string;
  apiKey: string;
}

interface ValidateModelAccessParams {
  provider: Provider;
  model: string;
  apiKey: string;
}

type ModelMessage = { role: "user" | "assistant"; content: string };

function getModel(provider: Provider, model: string, apiKey: string) {
  if (provider === "google") {
    return createGoogleGenerativeAI({ apiKey })(model);
  }
  return createAnthropic({ apiKey })(model);
}

function cleanSQL(raw: string): string {
  const withoutFences = raw
    .replace(/```sql\n?/gi, "")
    .replace(/```\n?/g, "")
    .trim();

  const sqlStartIndex = withoutFences.search(/\b(SELECT|WITH)\b/i);
  const fromFirstSqlToken =
    sqlStartIndex >= 0 ? withoutFences.slice(sqlStartIndex) : withoutFences;

  const firstSemicolonIndex = fromFirstSqlToken.indexOf(";");
  const singleStatement =
    firstSemicolonIndex >= 0
      ? fromFirstSqlToken.slice(0, firstSemicolonIndex)
      : fromFirstSqlToken;

  return singleStatement.trim();
}

function getStatusCode(error: unknown): number | null {
  if (!error || typeof error !== "object") return null;
  const withStatus = error as { statusCode?: unknown; status?: unknown };
  if (typeof withStatus.statusCode === "number") return withStatus.statusCode;
  if (typeof withStatus.status === "number") return withStatus.status;
  return null;
}

function isRetryableError(error: unknown): boolean {
  const statusCode = getStatusCode(error);
  if (statusCode === 401) return false;
  if (statusCode === 429) return true;
  if (statusCode !== null) return statusCode >= 500;
  return true;
}

async function withRetry<T>(fn: () => Promise<T>, maxAttempts = 3): Promise<T> {
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

export function buildSchemaContext(schema: SchemaInfo): string {
  const tableLines = schema.tables.map((table) => {
    const columns = table.columns
      .map((column) => {
        const flags = [
          column.isPrimaryKey ? "pk" : null,
          column.isForeignKey ? "fk" : null,
          column.nullable ? "nullable" : "not-null",
        ]
          .filter(Boolean)
          .join(", ");
        const reference = column.references
          ? ` -> ${column.references.table}.${column.references.column}`
          : "";
        return `  - ${column.name}: ${column.type} (${flags})${reference}`;
      })
      .join("\n");
    return `Table ${table.name}\n${columns}`;
  });

  return [
    "You are a SQL expert. You generate PostgreSQL SELECT queries based on natural language questions.",
    "",
    "IMPORTANT RULES:",
    "- Return ONLY the SQL query. No explanations, no markdown, no code fences.",
    "- Only write SELECT queries. Never write INSERT, UPDATE, DELETE, DROP, ALTER, or any DDL.",
    "- Always use table aliases (e.g., o for orders, c for customers).",
    "- Use explicit JOINs, never implicit.",
    "- For date filtering, use CURRENT_DATE and intervals (e.g., CURRENT_DATE - INTERVAL '30 days').",
    "- Think step by step: (1) identify needed tables, (2) determine joins, (3) apply filters, (4) write SQL.",
    "",
    "DATABASE SCHEMA:",
    schema.summary,
    "",
    "STRUCTURED TABLE DETAILS:",
    tableLines.join("\n\n"),
  ].join("\n");
}

export async function generateSQL(params: GenerateSQLParams): Promise<string> {
  const systemPrompt = buildSchemaContext(params.schema);
  const historyMessages: ModelMessage[] = params.history
    .slice(-10)
    .map((message) => ({
      role: message.role,
      content: message.role === "user" ? message.content : (message.sql ?? message.content),
    }));

  const messages: ModelMessage[] = [
    ...historyMessages,
    { role: "user", content: params.question },
  ];

  const { text } = await withRetry(async () =>
    generateText({
      model: getModel(params.provider, params.model, params.apiKey),
      system: systemPrompt,
      messages,
      maxOutputTokens: 1000,  
      temperature: 0.1,
    }),
  );

  return cleanSQL(text);
}

export async function generateExplanation(
  params: GenerateExplanationParams,
): Promise<string> {
  const prompt = [
    `Question: ${params.question}`,
    `SQL executed: ${params.sql}`,
    `Rows returned: ${params.rowCount}`,
    "Write a brief explanation.",
  ].join("\n");

  const { text } = await withRetry(async () =>
    generateText({
      model: getModel(params.provider, params.model, params.apiKey),
      system:
        "You are a data analyst. Explain query results in 1-2 sentences. Be specific about numbers.",
      prompt,
      maxOutputTokens: 120,
      temperature: 0.2,
    }),
  );

  return text.trim();
}

function sanitizeChartHint(raw: string): ChartHint | null {
  try {
    const parsed = JSON.parse(raw) as ChartHint;
    if (!parsed || typeof parsed !== "object") return null;

    const pickString = (value: unknown): string | undefined =>
      typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
    const pickStringArray = (value: unknown): string[] | undefined =>
      Array.isArray(value)
        ? value.filter((v): v is string => typeof v === "string" && v.trim().length > 0).map((v) => v.trim())
        : undefined;

    const type = pickString(parsed.type);
    if (
      type &&
      type !== "bar" &&
      type !== "line" &&
      type !== "pie" &&
      type !== "scatter" &&
      type !== "area" &&
      type !== "table"
    ) {
      return null;
    }

    return {
      type: type as ChartHint["type"],
      xKey: pickString(parsed.xKey),
      yKey: pickString(parsed.yKey),
      yKeys: pickStringArray(parsed.yKeys),
      nameKey: pickString(parsed.nameKey),
      valueKey: pickString(parsed.valueKey),
    };
  } catch {
    return null;
  }
}

export async function generateChartHint(
  params: GenerateChartHintParams,
): Promise<ChartHint | null> {
  const sampleRows = params.result.rows.slice(0, 12);
  const prompt = [
    "Choose the best visualization config for this SQL result.",
    "Return JSON only with keys: type, xKey, yKey, yKeys, nameKey, valueKey.",
    "Allowed type: bar | line | area | scatter | pie | table.",
    "Rules:",
    "- Prefer line/area for time series trends.",
    "- Use pie only when exactly one categorical dimension + one numeric metric and <=10 rows.",
    "- For comparison queries with multiple numeric metrics, use grouped bar and set yKeys.",
    "- Never invent columns. Use only provided column names.",
    "",
    `Question: ${params.question}`,
    `SQL: ${params.sql}`,
    `Columns: ${JSON.stringify(params.result.columns)}`,
    `Row count: ${params.result.rowCount}`,
    `Sample rows: ${JSON.stringify(sampleRows)}`,
  ].join("\n");

  const { text } = await withRetry(async () =>
    generateText({
      model: getModel(params.provider, params.model, params.apiKey),
      system:
        "You are a chart planner for SQL results. Return strict JSON only, no markdown or prose.",
      prompt,
      maxOutputTokens: 220,
      temperature: 0,
    }),
  );

  return sanitizeChartHint(text.trim());
}

export async function validateModelAccess(
  params: ValidateModelAccessParams,
): Promise<void> {
  await withRetry(async () =>
    generateText({
      model: getModel(params.provider, params.model, params.apiKey),
      system:
        "You are a health check assistant. Reply with exactly: OK",
      prompt: "Respond with OK.",
      maxOutputTokens: 10,
      temperature: 0,
    }),
  );
}
