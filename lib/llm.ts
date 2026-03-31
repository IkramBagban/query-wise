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
    message.includes("invalid api key") ||
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

function getModelCandidates(provider: Provider, preferredModel: string): string[] {
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

  throw lastError instanceof Error ? lastError : new Error("Model execution failed");
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
      content: message.role === "user" ? message.content : (message.sql ?? message.content),
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
      content: message.role === "user" ? message.content : (message.sql ?? message.content),
    }));

  const hasLatestQuestion =
    historyMessages.length > 0 &&
    historyMessages[historyMessages.length - 1]?.role === "user" &&
    historyMessages[historyMessages.length - 1]?.content.trim() === params.question.trim();

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
          maxOutputTokens: 600,
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
            partial && typeof partial === "object" && typeof partial.explanation === "string"
              ? partial.explanation
              : "";

          if (!nextExplanation) continue;
          const delta = getDeltaFromProgress(streamedExplanation, nextExplanation);
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
        system:
          "You are a health check assistant. Reply with exactly: OK",
        prompt: "Respond with OK.",
        maxOutputTokens: 10,
        temperature: 0,
      }),
  });
}
