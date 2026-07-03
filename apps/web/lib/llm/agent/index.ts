import "server-only";
import { stepCountIs, streamText, type ToolSet } from "ai";
import { AppError } from "@query-wise/shared/dal/core";
import { devLog } from "@query-wise/shared/observability";
import { resolveChartConfig } from "@/lib/charts";
import type { ChatMessage } from "@/types";
import { getModel, getModelCandidates, shouldFallbackToAnotherModel } from "../client";
import { buildAnalystAgentSystemPrompt, usesIndexRegime } from "./system-prompt";
import { createDescribeTablesTool } from "./tools/describe-tables";
import { createRunSqlTool } from "./tools/run-sql";
import { createSampleValuesTool } from "./tools/sample-values";
import { createSetChartTool } from "./tools/set-chart";
import {
  AGENT_BUDGETS,
  type AgentRunState,
  type AnalystAgentResult,
  type RunAnalystAgentParams,
} from "./types";

export type {
  AgentActivityEvent,
  AgentQueryStatsEvent,
  AgentResultBlock,
  AgentSqlPreviewEvent,
  AgentTranscriptStep,
  AnalystAgentEmitters,
  AnalystAgentResult,
  AnalystAgentRuntime,
  RunAnalystAgentParams,
  SqlValidationOutcome,
} from "./types";

interface AgentMessage {
  role: "user" | "assistant";
  content: string;
}

function buildMessages(history: ChatMessage[], question: string): AgentMessage[] {
  const messages: AgentMessage[] = history.slice(-12).map((message) => ({
    role: message.role,
    content:
      message.role === "assistant" && message.sql
        ? `${message.content}\n\n[SQL used: ${message.sql}]`
        : message.content,
  }));
  const last = messages[messages.length - 1];
  if (!last || last.role !== "user" || last.content.trim() !== question.trim()) {
    messages.push({ role: "user", content: question });
  }
  return messages;
}

function buildTools(params: RunAnalystAgentParams, state: AgentRunState): ToolSet {
  const shared = { state, runtime: params.runtime, emitters: params };
  const tools: ToolSet = {
    run_sql: createRunSqlTool(shared),
    sample_values: createSampleValuesTool({ ...shared, schema: params.schema }),
    set_chart: createSetChartTool({ state, emitters: params }),
  };
  if (usesIndexRegime(params.schema)) {
    tools.describe_tables = createDescribeTablesTool({ schema: params.schema, state, emitters: params });
  }
  return tools;
}

/**
 * The analyst agent loop (docs/AGENTIC_ARCHITECTURE.md §3): one streamed
 * conversation turn in which the model plans, queries via tools, self-corrects
 * on tool errors, and writes the answer. Replaces the V2 staged pipeline.
 */
export async function runAnalystAgent(params: RunAnalystAgentParams): Promise<AnalystAgentResult> {
  const startedAt = Date.now();
  const state: AgentRunState = { blocks: [], transcript: [], sqlAttempts: 0, sampleCalls: 0 };
  const system = buildAnalystAgentSystemPrompt(params.schema);
  const messages = buildMessages(params.history, params.question);
  const tools = buildTools(params, state);

  let streamedText = false;
  const streamOnce = async (candidateModel: string): Promise<string> => {
    const result = streamText({
      model: getModel(params.provider, candidateModel, params.apiKey),
      system,
      messages,
      tools,
      stopWhen: stepCountIs(AGENT_BUDGETS.maxSteps),
      maxOutputTokens: 2500,
      temperature: 0.2,
      abortSignal: params.abortSignal,
    });
    let text = "";
    let reasoning = "";
    for await (const part of result.fullStream) {
      if (part.type === "text-delta" && part.text) {
        text += part.text;
        streamedText = true;
        params.onTextDelta?.(part.text);
      } else if (part.type === "reasoning-delta" && part.text) {
        reasoning += part.text;
        params.onActivity?.({ kind: "thinking-delta" as any, label: "Thinking", chunk: part.text } as any);
      } else if (part.type === "start-step") {
        params.onActivity?.({ kind: "thinking", label: "Thinking" });
      } else if (part.type === "error") {
        throw part.error;
      }
    }
    if (reasoning.trim()) {
      state.transcript.push({ tool: "thinking", input: {}, outcome: "ok", summary: reasoning.trim() });
    }
    return text;
  };

  // Model fallback is only safe before anything user-visible happened —
  // replaying after streamed text or executed queries would duplicate work.
  let answer = "";
  const candidates = getModelCandidates(params.provider, params.model);
  for (let index = 0; index < candidates.length; index += 1) {
    try {
      answer = await streamOnce(candidates[index]);
      break;
    } catch (error) {
      const sideEffects = streamedText || state.transcript.length > 0;
      const lastCandidate = index === candidates.length - 1;
      if (sideEffects || lastCandidate || !shouldFallbackToAnotherModel(error)) throw error;
    }
  }

  if (!answer.trim()) {
    throw new AppError("QUERY_GENERATION_FAILED", "The model returned no answer text.");
  }

  for (const block of state.blocks) {
    block.chartConfig = resolveChartConfig(
      {
        columns: block.result.columns.map((column) => column.name),
        rows: block.result.rows,
        rowCount: block.result.returnedRowCount,
        executionTimeMs: block.result.executionTimeMs,
      },
      block.chartHint,
    );
  }

  devLog("info", "agent.run.completed", "Analyst agent run completed.", {
    durationMs: Date.now() - startedAt,
    blockCount: state.blocks.length,
    sqlAttempts: state.sqlAttempts,
    sampleCalls: state.sampleCalls,
    answerLength: answer.length,
    indexRegime: usesIndexRegime(params.schema),
  });

  return {
    mode: state.blocks.length > 0 ? "query" : "conversation",
    answer: answer.trim(),
    blocks: state.blocks,
    transcript: state.transcript,
  };
}
