import "server-only";
import { stepCountIs, streamText, type ToolSet } from "ai";
import { AppError } from "@query-wise/shared/dal/core";
import { devLog } from "@query-wise/shared/observability";
import { resolveChartConfig } from "@/lib/charts";
import type { ChatMessage } from "@/types";
import {
  getModel,
  getModelCandidates,
  getThinkingProviderOptions,
  shouldFallbackToAnotherModel,
} from "../client";
import { buildAnalystAgentSystemPrompt, usesIndexRegime } from "./system-prompt";
import { createDescribeTablesTool } from "./tools/describe-tables";
import { createRunSqlTool } from "./tools/run-sql";
import { createSampleValuesTool } from "./tools/sample-values";
import { createSetChartTool } from "./tools/set-chart";
import {
  AGENT_BUDGETS,
  AgentExecutionError,
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
      providerOptions: getThinkingProviderOptions(params.provider),
      abortSignal: params.abortSignal,
    });
    let text = "";
    // Reasoning is captured per segment: each contiguous run of thoughts (before
    // the model calls a tool or writes text) becomes its own ordered transcript
    // step, so the finalized view matches the live interleaving instead of
    // collapsing every thought into one block appended at the end.
    let segment = "";
    const flushReasoning = () => {
      if (segment.trim()) {
        state.transcript.push({ tool: "thinking", input: {}, outcome: "ok", summary: segment.trim() });
      }
      segment = "";
    };
    for await (const part of result.fullStream) {
      if (part.type === "reasoning-delta" && part.text) {
        // Start a fresh thinking block whenever reasoning resumes after a tool
        // call or text — otherwise later thoughts get dropped by the UI reducer.
        if (!segment) params.onActivity?.({ kind: "thinking", label: "Thinking" });
        segment += part.text;
        params.onActivity?.({ kind: "thinking-delta", label: "Thinking", chunk: part.text });
      } else if (part.type === "text-delta" && part.text) {
        flushReasoning();
        text += part.text;
        streamedText = true;
        params.onTextDelta?.(part.text);
      } else if (part.type === "tool-call") {
        flushReasoning();
      } else if (part.type === "error") {
        throw part.error;
      }
    }
    flushReasoning();
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
      if (sideEffects || lastCandidate || !shouldFallbackToAnotherModel(error)) {
        throw new AgentExecutionError(
          error instanceof Error ? error.message : "Agent execution failed",
          { mode: state.blocks.length > 0 ? "query" : "conversation", blocks: state.blocks, transcript: state.transcript },
          error
        );
      }
    }
  }

  if (!answer.trim()) {
    throw new AgentExecutionError(
      "The model returned no answer text.",
      { mode: state.blocks.length > 0 ? "query" : "conversation", blocks: state.blocks, transcript: state.transcript }
    );
  }

  // Charts are resolved eagerly (default in run_sql, refined in set_chart) so
  // they stream live; this is only a safety net for blocks missing a config.
  for (const block of state.blocks) {
    if (block.chartConfig) continue;
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
