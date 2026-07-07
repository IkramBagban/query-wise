import "server-only";
import { stepCountIs, streamText, type JSONValue, type ModelMessage, type ToolSet } from "ai";
import { devLog } from "@query-wise/shared/observability";
import { resolveChartConfig } from "@/lib/charts";
import type { ChatMessage } from "@/types";
import {
  getModel,
  getModelCandidates,
  getThinkingProviderOptions,
  isContextOverflowError,
  isRetryableError,
  shouldFallbackToAnotherModel,
} from "../client";
import { assembleAgentSystemPrompt } from "./system-prompt";
import { estimateTokens, resolveContextBudget } from "./context-budget";
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

/** Number of trailing messages (~2 turns) always kept verbatim in history. */
const HISTORY_VERBATIM_MESSAGES = 4;

function renderHistoryMessage(message: ChatMessage): AgentMessage {
  return {
    role: message.role,
    content:
      message.role === "assistant" && message.sql
        ? `${message.content}\n\n[SQL used: ${message.sql}]`
        : message.content,
  };
}

/**
 * Token-aware history selection (SPEC-01 §3): keep the last ~2 turns verbatim,
 * then add older messages newest-first until the history token budget is spent;
 * drop the rest. Replaces the fixed `history.slice(-12)`.
 */
function buildMessages(
  history: ChatMessage[],
  question: string,
  historyBudgetTokens: number,
  maxMessages?: number,
): AgentMessage[] {
  const rendered = history.map(renderHistoryMessage);
  const verbatimCount = Math.min(rendered.length, HISTORY_VERBATIM_MESSAGES);
  const tail = rendered.slice(rendered.length - verbatimCount);
  const older = rendered.slice(0, rendered.length - verbatimCount);

  let usedTokens = tail.reduce((sum, message) => sum + estimateTokens(message.content), 0);
  const kept: AgentMessage[] = [];
  for (let index = older.length - 1; index >= 0; index -= 1) {
    if (maxMessages !== undefined && kept.length + tail.length >= maxMessages) break;
    const cost = estimateTokens(older[index].content);
    if (usedTokens + cost > historyBudgetTokens) break;
    kept.unshift(older[index]);
    usedTokens += cost;
  }

  let messages = [...kept, ...tail];
  if (maxMessages !== undefined && messages.length > maxMessages) {
    messages = messages.slice(messages.length - maxMessages);
  }

  const last = messages[messages.length - 1];
  if (!last || last.role !== "user" || last.content.trim() !== question.trim()) {
    messages.push({ role: "user", content: question });
  }
  return messages;
}

function buildTools(params: RunAnalystAgentParams, state: AgentRunState): ToolSet {
  const shared = { state, runtime: params.runtime, emitters: params };
  // describe_tables is ALWAYS registered (SPEC-01 §3): with the tiered schema
  // any table may appear only in the Tier-A index, so the agent must be able to
  // fetch full column detail for it on demand.
  return {
    run_sql: createRunSqlTool(shared),
    sample_values: createSampleValuesTool({ ...shared, schema: params.schema }),
    describe_tables: createDescribeTablesTool({ schema: params.schema, state, emitters: params }),
    set_chart: createSetChartTool({ state, emitters: params }),
  };
}

/** Digest an older run_sql result (SPEC-01 §4): keep shape + a 3-row sample. */
function digestRunSqlOutput(
  output: unknown,
  state: AgentRunState,
): { type: "json"; value: JSONValue } | null {
  if (!output || typeof output !== "object") return null;
  const wrapped = output as { type?: string; value?: unknown };
  if (wrapped.type !== "json" || !wrapped.value || typeof wrapped.value !== "object") return null;
  const value = wrapped.value as Record<string, unknown>;
  // Errors and non-block results are already small — leave them verbatim.
  if (value.error !== undefined || typeof value.blockIndex !== "number") return null;

  const block = state.blocks.find((candidate) => candidate.index === value.blockIndex);
  const rows = Array.isArray(value.rows) ? value.rows : [];
  const digest = {
    blockIndex: value.blockIndex,
    purpose: block?.purpose,
    columns: value.columns,
    rowCount: value.rowCount,
    totalRowCount: value.totalRowCount,
    truncated: value.truncated,
    sampleRows: rows.slice(0, 3),
    note: "summarized — the full result is shown to the user as a block; re-query only if you need values you no longer see",
  };
  return { type: "json", value: digest as unknown as JSONValue };
}

/**
 * Rewrite every run_sql tool result EXCEPT the most recent into a compact digest
 * (SPEC-01 §4). sample_values / describe_tables results are already small and
 * stay verbatim. Runs inside the AI SDK `prepareStep` hook before each step.
 */
function compactToolResults(messages: ModelMessage[], state: AgentRunState): ModelMessage[] {
  const runSqlLocations: Array<{ messageIndex: number; partIndex: number }> = [];
  messages.forEach((message, messageIndex) => {
    if (message.role !== "tool" || !Array.isArray(message.content)) return;
    message.content.forEach((part, partIndex) => {
      if (part.type === "tool-result" && part.toolName === "run_sql") {
        runSqlLocations.push({ messageIndex, partIndex });
      }
    });
  });
  if (runSqlLocations.length <= 1) return messages;
  const mostRecent = runSqlLocations[runSqlLocations.length - 1];

  return messages.map((message, messageIndex) => {
    if (message.role !== "tool" || !Array.isArray(message.content)) return message;
    let changed = false;
    const content = message.content.map((part, partIndex) => {
      if (part.type !== "tool-result" || part.toolName !== "run_sql") return part;
      if (messageIndex === mostRecent.messageIndex && partIndex === mostRecent.partIndex) return part;
      const digest = digestRunSqlOutput(part.output, state);
      if (!digest) return part;
      changed = true;
      return { ...part, output: digest };
    });
    return changed ? { ...message, content } : message;
  });
}

/** Short digest of already-executed blocks, injected during recovery (SPEC-01 §1). */
function renderBlockDigests(state: AgentRunState): string {
  return state.blocks
    .map((block) => {
      const columns = block.result.columns.map((column) => column.name).join(", ");
      const sample = JSON.stringify(block.result.rows.slice(0, 3));
      return `- block ${block.index} (${block.purpose}): ${block.result.returnedRowCount} rows; columns: ${columns}; sample: ${sample}`;
    })
    .join("\n");
}

/**
 * The analyst agent loop (docs/AGENTIC_ARCHITECTURE.md §3): one streamed
 * conversation turn in which the model plans, queries via tools, self-corrects
 * on tool errors, and writes the answer. Context is token-budgeted, tiered, and
 * self-recovering (SPEC-01).
 */
export async function runAnalystAgent(params: RunAnalystAgentParams): Promise<AnalystAgentResult> {
  const startedAt = Date.now();
  const state: AgentRunState = { blocks: [], transcript: [], sqlAttempts: 0, sampleCalls: 0 };
  const budget = resolveContextBudget(params.provider, params.model);
  const tools = buildTools(params, state);

  let streamedText = false;

  // One streamed attempt. `recovery` re-runs with a shrunken context after a
  // true mid-run context overflow (SPEC-01 §1).
  const streamOnce = async (
    candidateModel: string,
    apiKey: string,
    recovery = false,
  ): Promise<string> => {
    const assembled = assembleAgentSystemPrompt(params.schema, {
      rankedTableNames: params.rankedTables,
      schemaBudgetTokens: budget.schema,
      disableTierB: recovery, // recovery drops the schema one tier (Tier B off).
    });
    const system = assembled.text;

    const historyBudget = recovery ? Math.floor(budget.history / 2) : budget.history;
    const messages: AgentMessage[] = buildMessages(
      params.history,
      params.question,
      historyBudget,
      recovery ? HISTORY_VERBATIM_MESSAGES : undefined,
    );
    if (recovery && state.blocks.length > 0) {
      messages.push({
        role: "user",
        content:
          "Recovery: the previous attempt exceeded the model's working memory. " +
          "You have already executed these queries (their full results are shown to the user as blocks):\n" +
          `${renderBlockDigests(state)}\n` +
          "Write the final analyst answer now using these results. Only run additional SQL if strictly necessary.",
      });
    }

    // Stable prefix first (system → schema), dynamic content (history/question)
    // after, for prompt caching (SPEC-01 §5). Anthropic gets an explicit
    // ephemeral cache marker on the system message; Google caches implicitly.
    const systemMessage: ModelMessage = {
      role: "system",
      content: system,
      ...(params.provider === "anthropic"
        ? { providerOptions: { anthropic: { cacheControl: { type: "ephemeral" } } } }
        : {}),
    };
    const modelMessages: ModelMessage[] = [systemMessage, ...(messages as ModelMessage[])];

    devLog("info", "agent.context.assembled", "Assembled agent context.", {
      recovery,
      model: candidateModel,
      budgetTotal: budget.total,
      budgetTarget: budget.target,
      systemTokens: assembled.systemTokens,
      schemaTokens: assembled.schema.schemaTokens,
      tierATables: assembled.schema.tierATableCount,
      tierBTables: assembled.schema.tierBTableCount,
      historyTokens: messages.reduce((sum, message) => sum + estimateTokens(message.content), 0),
      historyMessages: messages.length,
    });

    const result = streamText({
      model: getModel(params.provider, candidateModel, apiKey),
      messages: modelMessages,
      tools,
      stopWhen: stepCountIs(AGENT_BUDGETS.maxSteps),
      maxOutputTokens: 2500,
      temperature: 0.2,
      providerOptions: getThinkingProviderOptions(params.provider),
      abortSignal: params.abortSignal,
      // §4 tool-result compaction: digest older run_sql results before each step.
      prepareStep: ({ messages: stepMessages, stepNumber }) => {
        const compacted = compactToolResults(stepMessages, state);
        devLog("debug", "agent.context.assembled", "Per-step assembled context.", {
          stepNumber,
          recovery,
          stepTokens: compacted.reduce(
            (sum, message) =>
              sum + estimateTokens(typeof message.content === "string" ? message.content : JSON.stringify(message.content)),
            0,
          ),
        });
        return { messages: compacted };
      },
    });

    let text = "";
    // Reasoning is captured per segment: each contiguous run of thoughts (before
    // the model calls a tool or writes text) becomes its own ordered transcript
    // step, so the finalized view matches the live interleaving instead of
    // collapsing every thought into one block appended
    let segment = "";
    const flushReasoning = () => {
      if (segment.trim()) {
        const thought = segment.trim();
        devLog("debug", "agent.thought.completed", "Thought block completed", { text: thought });
        state.transcript.push({ tool: "thinking", input: {}, outcome: "ok", summary: thought });
      }
      segment = "";
    };
    for await (const part of result.fullStream) {
      if (part.type === "reasoning-delta" && part.text) {
        // Start a fresh thinking block whenever reasoning resumes after a tool
        // call or text — otherwise later thoughts get dropped by the UI reducer.
        if (!segment) {
          params.onActivity?.({ kind: "thinking", label: "Thinking" });
          devLog("debug", "agent.thought.started", "Thought block started");
        }
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

    // Cache-hit metrics when the provider reports them (SPEC-01 §5).
    try {
      const usage = await result.usage;
      const cachedInputTokens = (usage as { cachedInputTokens?: number } | undefined)?.cachedInputTokens;
      if (typeof cachedInputTokens === "number") {
        devLog("info", "agent.cache.usage", "Prompt cache usage.", {
          recovery,
          model: candidateModel,
          cachedInputTokens,
          inputTokens: (usage as { inputTokens?: number }).inputTokens,
        });
      }
    } catch {
      // Usage is best-effort telemetry; never fail the run over it.
    }
    return text;
  };

  devLog("debug", "agent.run.started", "Analyst agent run started.", {
    question: params.question,
    model: params.model,
    tableCount: params.schema.tables.length,
    rankedTables: params.rankedTables?.length ?? 0,
  });

  const failure = (error: unknown): AgentExecutionError =>
    new AgentExecutionError(
      error instanceof Error ? error.message : "Agent execution failed",
      { mode: state.blocks.length > 0 ? "query" : "conversation", blocks: state.blocks, transcript: state.transcript },
      error,
    );

  // Model fallback is only safe before anything user-visible happened —
  // replaying after streamed text or executed queries would duplicate work.
  let answer = "";
  let recovered = false;
  const candidates = getModelCandidates(params.provider, params.model);
  const apiKeys = params.apiKeys;

  outer: for (let index = 0; index < candidates.length; index += 1) {
    let success = false;
    for (let keyAttempt = 0; keyAttempt < apiKeys.length; keyAttempt += 1) {
      try {
        answer = await streamOnce(candidates[index], apiKeys[keyAttempt]);
        success = true;
        break;
      } catch (error) {
        const sideEffects = streamedText || state.transcript.length > 0;

        // In-run recovery (SPEC-01 §1): one compact-and-retry attempt when a
        // true context overflow strikes after side effects (model fallback is
        // then unsafe). Rebuilds with compacted results, last-2-turn history,
        // and the schema dropped one tier.
        if (sideEffects && isContextOverflowError(error) && !recovered) {
          recovered = true;
          devLog("info", "agent.context.recovery", "Attempting compact-and-retry after context overflow.", {
            model: candidates[index],
            blocks: state.blocks.length,
          });
          try {
            answer = await streamOnce(candidates[index], apiKeys[keyAttempt], true);
            success = true;
            break outer;
          } catch (recoveryError) {
            throw failure(recoveryError);
          }
        }

        const lastCandidate = index === candidates.length - 1;
        const lastKey = keyAttempt === apiKeys.length - 1;

        if (sideEffects || !isRetryableError(error)) {
          throw failure(error);
        }
        if (lastKey && (lastCandidate || !shouldFallbackToAnotherModel(error))) {
          throw failure(error);
        }
      }
    }
    if (success) break;
  }

  if (!answer.trim()) {
    throw new AgentExecutionError(
      "The model returned no answer text.",
      { mode: state.blocks.length > 0 ? "query" : "conversation", blocks: state.blocks, transcript: state.transcript },
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
    recovered,
  });

  return {
    mode: state.blocks.length > 0 ? "query" : "conversation",
    answer: answer.trim(),
    blocks: state.blocks,
    transcript: state.transcript,
  };
}
