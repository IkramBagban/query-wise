import type { ChartHint, ChatMessage, SchemaInfo } from "@/types";
import { getModel, type Provider, withModelFallback } from "./client";
import type { ExecuteQueryToolResult } from "./llm";
import { z } from "zod";
import { buildConstrainedAgentSystemPrompt } from "./prompts";
import type { ModelMessage } from "./sql";
import { Output, stepCountIs, streamText, tool } from "ai";

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
          stopWhen: stepCountIs (8),
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
