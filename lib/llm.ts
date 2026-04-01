import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateText, Output, stepCountIs, streamText, tool } from "ai";
import { z } from "zod";

import {
  LLM_MODEL_CATALOG,
  SUPPORTED_MODELS_BY_PROVIDER,
  type LlmProvider,
} from "@/lib/llm-config";
import { sleep } from "@/lib/utils";
import type { ChartHint, ChatMessage, SchemaInfo } from "@/types";

type Provider = LlmProvider;

export const SUPPORTED_MODELS = LLM_MODEL_CATALOG;

const PROVIDER_MODELS: Record<Provider, string[]> = {
  google: [...SUPPORTED_MODELS_BY_PROVIDER.google],
  anthropic: [...SUPPORTED_MODELS_BY_PROVIDER.anthropic],
};

interface GenerateSQLParams {
  question: string;
  schema: SchemaInfo;
  history: ChatMessage[];
  provider: Provider;
  model: string;
  apiKey: string;
}

interface GenerateSchemaAnalysisParams {
  schema: SchemaInfo;
  provider: Provider;
  model: string;
  apiKey: string;
}

interface ValidateModelAccessParams {
  provider: Provider;
  model: string;
  apiKey: string;
}

export interface ExecuteQueryToolResult {
  sql: string;
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  executionTimeMs: number;
}

interface RunConstrainedAgentParams {
  question: string;
  history: ChatMessage[];
  schema: SchemaInfo;
  provider: Provider;
  model: string;
  apiKey: string;
  executeQueryTool: (question: string) => Promise<ExecuteQueryToolResult>;
  onTextDelta?: (chunk: string) => void;
  onStage?: (label: string) => void;
}

export interface ConstrainedAgentResponse {
  mode: "query" | "conversation";
  explanation: string;
  chartHint: ChartHint | null;
  toolResult: ExecuteQueryToolResult | null;
}

const AgentChartHintSchema = z.object({
  type: z.enum(["bar", "line", "pie", "scatter", "area", "table"]).optional(),
  xKey: z.string().trim().min(1).optional(),
  yKey: z.string().trim().min(1).optional(),
  yKeys: z.array(z.string().trim().min(1)).optional(),
  nameKey: z.string().trim().min(1).optional(),
  valueKey: z.string().trim().min(1).optional(),
});

const AgentOutputSchema = z.object({
  mode: z.enum(["query", "conversation"]),
  explanation: z.string(),
  chartHint: AgentChartHintSchema.nullable().optional().default(null),
});

type AgentOutput = z.infer<typeof AgentOutputSchema>;

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
  if (statusCode === 403) return false;
  if (statusCode === 429) return true;
  if (statusCode !== null) return statusCode >= 500;
  return true;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "";
}

function isAuthError(error: unknown): boolean {
  const statusCode = getStatusCode(error);
  if (statusCode === 401 || statusCode === 403) return true;

  const message = getErrorMessage(error).toLowerCase();
  return (
    message.includes("api_key_invalid") ||
    message.includes("invalid api key") ||
    message.includes("valid api key") ||
    message.includes("authentication") ||
    message.includes("unauthorized")
  );
}

function shouldFallbackToAnotherModel(error: unknown): boolean {
  if (isAuthError(error)) return false;

  const statusCode = getStatusCode(error);
  if (statusCode === 429) return true;
  if (statusCode !== null && statusCode >= 500) return true;
  if (statusCode === 404) return true;

  const message = getErrorMessage(error).toLowerCase();
  return (
    message.includes("model") ||
    message.includes("not found") ||
    message.includes("unsupported") ||
    message.includes("unavailable") ||
    message.includes("overloaded") ||
    message.includes("capacity") ||
    message.includes("deprecated")
  );
}

function getModelCandidates(
  provider: Provider,
  preferredModel: string,
): string[] {
  const providerModels = PROVIDER_MODELS[provider];
  const candidates = [preferredModel, ...providerModels];
  return [...new Set(candidates)];
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

async function withModelFallback<T>(params: {
  provider: Provider;
  model: string;
  execute: (model: string) => Promise<T>;
}): Promise<T> {
  const candidates = getModelCandidates(params.provider, params.model);
  let lastError: unknown;

  for (const candidate of candidates) {
    try {
      return await withRetry(() => params.execute(candidate));
    } catch (error) {
      lastError = error;
      if (!shouldFallbackToAnotherModel(error)) {
        throw error;
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Model execution failed");
}

function buildStructuredTableContext(schema: SchemaInfo): string {
  return schema.tables
    .map((table) => {
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
          const enumInfo =
            (column.enumValues?.length ?? 0) > 0
              ? ` enum[${column.enumValues?.map((value) => `'${value}'`).join(", ")}]`
              : "";
          const rangeInfo = column.range
            ? ` range[${column.range.min} -> ${column.range.max}]`
            : "";
          const topValuesInfo =
            (column.topValues?.length ?? 0) > 0
              ? ` top[${column.topValues
                  ?.map((item) => `'${item.value}' (${item.count})`)
                  .join(", ")}]`
              : "";
          const defaultInfo = column.defaultValue
            ? ` default=${column.defaultValue}`
            : "";
          const typeLabel = column.fullType ?? column.type;
          return `  - ${column.name}: ${typeLabel} (${flags})${reference}${enumInfo}${rangeInfo}${topValuesInfo}${defaultInfo}`;
        })
        .join("\n");

      return `Table ${table.name}\n${columns}`;
    })
    .join("\n\n");
}

export function buildSchemaContext(schema: SchemaInfo): string {
  return [
    "You are an expert PostgreSQL analytics engineer.",
    "Your job is to generate a single safe PostgreSQL SELECT query from a user's natural-language question.",
    "",
    "OUTPUT RULES:",
    "- Return ONLY the SQL query.",
    "- Do not include explanations, markdown, comments, or code fences.",
    "- Return exactly one SQL statement.",
    "- The query must begin with SELECT or WITH.",
    "",
    "SAFETY RULES:",
    "- Only write read-only SQL.",
    "- Never write INSERT, UPDATE, DELETE, DROP, ALTER, TRUNCATE, CREATE, GRANT, REVOKE, or any DDL/DML.",
    "- Never query system tables, information_schema, pg_catalog, pg_shadow, or database metadata outside the provided schema context.",
    "",
    "SQL STYLE RULES:",
    "- Always use explicit JOINs. Never use implicit joins.",
    "- Always use clear table aliases (for example: o for orders, c for customers, oi for order_items, p for products).",
    "- Use fully qualified column references when multiple tables are involved.",
    "- Prefer readable output column aliases for analytics results.",
    "- Use snake_case aliases for output columns.",
    "- When returning currency-like averages or ratios, round to 2 decimal places when appropriate.",
    "- When ranking results, include ORDER BY on the requested metric.",
    "- When the user asks for top/bottom N, apply LIMIT N.",
    "- When grouping by time, use DATE_TRUNC with clear aliases such as order_day, order_week, order_month, or order_quarter.",
    "- When a result is intended for charting, return one clear dimension column and one or more clearly named metric columns.",
    "",
    "DATE AND TIME RULES:",
    "- For rolling windows, use CURRENT_DATE and PostgreSQL intervals.",
    "- For examples like past 30 days, use CURRENT_DATE - INTERVAL '30 days'.",
    "- For current month, last month, this quarter, last quarter, or this year, use DATE_TRUNC with correct calendar boundaries.",
    "- Prefer inclusive lower bounds and exclusive upper bounds for time ranges.",
    "",
    "AGGREGATION RULES:",
    "- Match aggregations exactly to the user's question.",
    "- Use COUNT(*) for row counts unless a distinct entity count is required.",
    "- Use COUNT(DISTINCT ...) only when the question implies unique entities.",
    "- Use AVG for averages, SUM for totals, MIN/MAX where appropriate.",
    "- Exclude likely identifier columns from aggregations unless explicitly requested.",
    "",
    "FOLLOW-UP RULES:",
    "- Use the conversation history to resolve follow-up questions.",
    "- If the user says things like 'now', 'same', 'those', 'only', 'exclude', or 'instead', preserve the prior query intent and modify only what the user changed.",
    "- Reuse earlier filters, groupings, entities, and time windows unless the user clearly replaces them.",
    "",
    "BUSINESS INTERPRETATION RULES:",
    "- Use only tables and columns that exist in the provided schema.",
    "- Infer the most relevant tables and joins from the schema and sample metadata.",
    "- If multiple interpretations are possible, choose the most natural analytics interpretation.",
    "- Prefer business-readable result shapes over raw transactional output unless the user explicitly asks for detailed rows.",
    "- For comparison queries, return side-by-side metrics when helpful.",
    "",
    "IMPORTANT:",
    "- Think silently before writing SQL.",
    "- First identify the needed tables.",
    "- Then determine the joins.",
    "- Then apply filters.",
    "- Then choose grouping, aggregation, and ordering.",
    "- Finally write the SQL query.",
    "",
    "DATABASE SCHEMA:",
    schema.summary,
    "",
    "STRUCTURED TABLE DETAILS:",
    buildStructuredTableContext(schema),
  ].join("\n");
}

function buildConstrainedAgentSystemPrompt(schema: SchemaInfo): string {
  return [
    "You are a senior data analyst operating a conversational BI assistant.",
    "",
    "Style:",
    "- concise, direct, and data-focused",
    "- natural but brief acknowledgements",
    "- no chatbot filler",
    "",
    "Decision policy:",
    "- Use the execute_query tool when the user asks to analyze database data.",
    "- If the user message is non-database chat, answer directly without any tool call.",
    "- If the user asks to modify data/schema, do not call tools; explain that analysis is read-only.",
    "",
    "Tool policy:",
    "- Tool input must be a clean natural-language analysis question.",
    "- Do not invent SQL directly in your response.",
    "- After tool output is available, summarize the result in analyst tone and choose a chart hint.",
    "",
    "Schema summary:",
    schema.summary,
    "",
    "Structured schema:",
    buildStructuredTableContext(schema),
  ].join("\n");
}

function sanitizeChartHint(raw: unknown): ChartHint | null {
  if (!raw || typeof raw !== "object") return null;
  const parsed = raw as ChartHint;

  const pickString = (value: unknown): string | undefined =>
    typeof value === "string" && value.trim().length > 0
      ? value.trim()
      : undefined;
  const pickStringArray = (value: unknown): string[] | undefined =>
    Array.isArray(value)
      ? value
          .filter(
            (v): v is string => typeof v === "string" && v.trim().length > 0,
          )
          .map((v) => v.trim())
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
}

function getDeltaFromProgress(previous: string, current: string): string {
  if (!current) return "";
  if (!previous) return current;
  if (current.startsWith(previous)) {
    return current.slice(previous.length);
  }

  const maxPrefix = Math.min(previous.length, current.length);
  let i = 0;
  while (i < maxPrefix && previous[i] === current[i]) {
    i += 1;
  }
  return current.slice(i);
}

export async function generateSQL(params: GenerateSQLParams): Promise<string> {
  const systemPrompt = buildSchemaContext(params.schema);
  const historyMessages: ModelMessage[] = params.history
    .slice(-10)
    .map((message) => ({
      role: message.role,
      content:
        message.role === "user"
          ? message.content
          : (message.sql ?? message.content),
    }));

  const messages: ModelMessage[] = [
    ...historyMessages,
    { role: "user", content: params.question },
  ];

  const { text } = await withModelFallback({
    provider: params.provider,
    model: params.model,
    execute: async (candidateModel) =>
      generateText({
        model: getModel(params.provider, candidateModel, params.apiKey),
        system: systemPrompt,
        messages,
        // Allow longer SQL (nested CTEs / complex joins) without truncation.
        maxOutputTokens: 2500,
        temperature: 0.1,
      }),
  });

  return cleanSQL(text);
}

export async function runConstrainedAnalystAgent(
  params: RunConstrainedAgentParams,
): Promise<ConstrainedAgentResponse> {
  const systemPrompt = buildConstrainedAgentSystemPrompt(params.schema);

  const historyMessages: ModelMessage[] = params.history
    .slice(-12)
    .map((message) => ({
      role: message.role,
      content:
        message.role === "user"
          ? message.content
          : (message.sql ?? message.content),
    }));

  const hasLatestQuestion =
    historyMessages.length > 0 &&
    historyMessages[historyMessages.length - 1]?.role === "user" &&
    historyMessages[historyMessages.length - 1]?.content.trim() ===
      params.question.trim();

  const messages: ModelMessage[] = hasLatestQuestion
    ? historyMessages
    : [...historyMessages, { role: "user", content: params.question }];

  let toolResult: ExecuteQueryToolResult | null = null;

  const runTurn = async (forcedTool: boolean): Promise<AgentOutput> => {
    return withModelFallback({
      provider: params.provider,
      model: params.model,
      execute: async (candidateModel) => {
        const result = streamText({
          model: getModel(params.provider, candidateModel, params.apiKey),
          system: systemPrompt,
          output: Output.object({ schema: AgentOutputSchema }),
          messages, 
          tools: {
            execute_query: tool({
              description:
                "Executes a database analysis question against the connected PostgreSQL schema and returns SQL + result rows.",
              inputSchema: z.object({
                question: z.string().trim().min(1).max(700),
              }),
              strict: true,
              execute: async ({ question }) => {
                params.onStage?.("Generating SQL");
                const output = await params.executeQueryTool(question);
                toolResult = output;
                return output;
              },
            }),
          },
          activeTools: ["execute_query"],
          toolChoice: forcedTool ? "required" : "auto",
          stopWhen: stepCountIs(8),
          maxOutputTokens: 2000,
          temperature: 0.1,
          experimental_onToolCallStart: () => {
            params.onStage?.("Calling execute_query");
          },
          experimental_onToolCallFinish: () => {
            params.onStage?.("Tool finished");
          },
        });

        let streamedExplanation = "";
        const bufferedDeltas: string[] = [];

        for await (const partial of result.partialOutputStream) {
          const nextExplanation =
            partial &&
            typeof partial === "object" &&
            typeof partial.explanation === "string"
              ? partial.explanation
              : "";

          if (!nextExplanation) continue;
          const delta = getDeltaFromProgress(
            streamedExplanation,
            nextExplanation,
          );
          streamedExplanation = nextExplanation;
          if (delta.length > 0) {
            bufferedDeltas.push(delta);
          }
        }

        const output = await result.output;
        for (const delta of bufferedDeltas) {
          params.onTextDelta?.(delta);
        }
        return output;
      },
    });
  };

  let output = await runTurn(false);

  if (output.mode === "query" && !toolResult) {
    output = await runTurn(true);
  }

  return {
    mode: toolResult ? "query" : output.mode,
    explanation: output.explanation.trim(),
    chartHint: sanitizeChartHint(output.chartHint),
    toolResult,
  };
}

export async function validateModelAccess(
  params: ValidateModelAccessParams,
): Promise<void> {
  await withModelFallback({
    provider: params.provider,
    model: params.model,
    execute: async (candidateModel) =>
      generateText({
        model: getModel(params.provider, candidateModel, params.apiKey),
        system: "You are a health check assistant. Reply with exactly: OK",
        prompt: "Respond with OK.",
        maxOutputTokens: 10,
        temperature: 0,
      }),
  });
}

export async function generateSchemaAnalysis(
  params: GenerateSchemaAnalysisParams,
): Promise<string> {
  const system = `
You are a principal analytics engineer writing concise, human-readable schema summaries for business users.

Your job is to explain:
- what the database appears to represent,
- what the main entities are,
- how they relate to each other,
- and what kinds of analysis the schema can support.

Use only the information explicitly provided in the schema context.
Do not invent business trends, KPI results, customer behavior patterns, seasonality, or performance insights.
If the schema alone is insufficient to support a claim, describe what the schema enables rather than asserting an observed finding.
Write for a smart non-technical stakeholder who is seeing this database for the first time.
`.trim();

  const prompt = [
    "Analyze this PostgreSQL schema for a non-technical BI user.",
    "",
    "Goal:",
    "- Produce a clear, polished, business-friendly schema summary.",
    "- Help the reader quickly understand what this database is for and how it can be used.",
    "",
    "Output requirements:",
    "- Use Markdown headings and bullet points only. No tables.",
    "- Use exactly these headings in this order:",
    "  1) ### Business Context",
    "  2) ### Core Entities",
    "  3) ### Key Relationships",
    "  4) ### Analytical Opportunities",
    "- Under each heading, write 2-4 short bullet points.",
    "- Use plain business language that a non-technical stakeholder can understand.",
    "- Prefer meaning and purpose over technical jargon.",
    "- Keep the tone polished, concise, natural, and human-readable.",
    "- Avoid raw column-name phrasing unless necessary.",
    "- Do not mention SQL, schemas, joins, or data types unless directly helpful.",
    "",
    "Grounding rules:",
    "- Base every statement only on the provided schema summary, relationships, sample values, and metadata.",
    "- Do not claim observed business trends or performance outcomes unless they are explicitly supported by the provided context.",
    "- Do not invent metrics, percentages, seasonality, customer behavior patterns, or revenue conclusions.",
    "- If evidence is limited, say what the schema enables analysis of, not what the data proves.",
    "- In 'Analytical Opportunities', mention only analyses directly supported by the tables, columns, relationships, and provided metadata.",
    "- If uncertainty is important, include one short final note only in this format: '_Note: ..._'",
    "",
    "Schema summary:",
    params.schema.summary,
    "",
    "Structured table details:",
    buildStructuredTableContext(params.schema),
  ].join("\n");

  const { text } = await withModelFallback({
    provider: params.provider,
    model: params.model,
    execute: async (candidateModel) =>
      generateText({
        model: getModel(params.provider, candidateModel, params.apiKey),
        system,
        prompt,
        // maxOutputTokens: 480,
        temperature: 0.15,
      }),
  });

  return text.trim();
}