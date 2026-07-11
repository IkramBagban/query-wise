import "server-only";
import { stepCountIs, streamText, type JSONValue, type ModelMessage, type ToolSet } from "ai";
import { devLog } from "@query-wise/shared/observability";
import { recordLlmUsage } from "@query-wise/shared/metrics";
import { resolveChartConfig } from "@/lib/charts";
import type { ChatMessage } from "@/types";
import {
  getModel,
  getThinkingProviderOptions,
  isContextOverflowError,
  isRetryableError,
  shouldFallbackToAnotherModel,
} from "../client";
import {
  isRateLimitError,
  markKeyCooled,
  MAX_LLM_ATTEMPTS,
  planAttempts,
  resolveTaskChain,
  type LlmCandidate,
  type RoutedAttempt,
} from "../model-router";
import { assembleAgentSystemPrompt } from "./system-prompt";
import { estimateTokens, resolveContextBudget } from "./context-budget";
import { createDescribeTablesTool } from "./tools/describe-tables";
import { createRunSqlTool } from "./tools/run-sql";
import { createSampleValuesTool } from "./tools/sample-values";
import { createSetChartTool } from "./tools/set-chart";
import { createSearchSchemaTool } from "./tools/search-schema";
import { createExplainQueryTool } from "./tools/explain-query";
import { createGetColumnStatsTool } from "./tools/get-column-stats";
import { runSelfVerification } from "./verification";
import {
  AgentExecutionError,
  resolveAgentBudget,
  type AgentMemoryContext,
  type AgentRunState,
  type AnalystAgentResult,
  type RunAnalystAgentParams,
} from "./types";

export type {
  AgentActivityEvent,
  AgentMemoryContext,
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
 * Render distilled conversation memory (SPEC-02 §4) as a single, compact
 * context message: rolling summary, established filters / window, and recent
 * block headlines. This is what makes "now break that down by region" resolve
 * correctly ten turns deep, after the verbatim window has scrolled away.
 * Returns null when there is nothing worth injecting.
 */
function renderMemoryPreamble(memory: AgentMemoryContext | undefined): string | null {
  if (!memory) return null;
  const parts: string[] = [];
  if (memory.rollingSummary?.trim()) parts.push(`Earlier in this conversation: ${memory.rollingSummary.trim()}`);
  if (memory.entities?.length) parts.push(`Entities discussed: ${memory.entities.join(", ")}`);
  if (memory.timeWindow?.trim()) parts.push(`Established time window: ${memory.timeWindow.trim()}`);
  if (memory.activeFilters?.length) parts.push(`Active filters: ${memory.activeFilters.join("; ")}`);
  if (memory.blockSummaries?.length) parts.push(`Recent results:\n${memory.blockSummaries.join("\n")}`);
  if (parts.length === 0) return null;
  return [
    "CONVERSATION MEMORY (for resolving follow-ups like \"break that down\" or \"same period\"; reuse these unless the user changes them):",
    ...parts,
  ].join("\n");
}

/**
 * Token-aware history selection (SPEC-01 §3): keep the last ~2 turns verbatim,
 * then add older messages newest-first until the history token budget is spent;
 * drop the rest. Replaces the fixed `history.slice(-12)`. A memory preamble
 * (SPEC-02 §4) is prepended within the same budget when present.
 */
function buildMessages(
  history: ChatMessage[],
  question: string,
  historyBudgetTokens: number,
  maxMessages?: number,
  memory?: AgentMemoryContext,
): AgentMessage[] {
  const rendered = history.map(renderHistoryMessage);
  const verbatimCount = Math.min(rendered.length, HISTORY_VERBATIM_MESSAGES);
  const tail = rendered.slice(rendered.length - verbatimCount);
  const older = rendered.slice(0, rendered.length - verbatimCount);

  const memoryPreamble = renderMemoryPreamble(memory);
  const memoryTokens = memoryPreamble ? estimateTokens(memoryPreamble) : 0;

  let usedTokens = tail.reduce((sum, message) => sum + estimateTokens(message.content), 0) + memoryTokens;
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

  // Memory rides in front of the retained history so follow-up resolution has it
  // regardless of how much verbatim history fit the budget.
  if (memoryPreamble) {
    messages = [{ role: "user", content: memoryPreamble }, ...messages];
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
  // fetch full column detail for it on demand. search_schema / explain_query /
  // get_column_stats are the SPEC-02 §1 perception tools, also always available.
  return {
    run_sql: createRunSqlTool(shared),
    sample_values: createSampleValuesTool({ ...shared, schema: params.schema }),
    describe_tables: createDescribeTablesTool({ schema: params.schema, state, emitters: params }),
    set_chart: createSetChartTool({ state, emitters: params }),
    search_schema: createSearchSchemaTool({ schema: params.schema, state, emitters: params }),
    explain_query: createExplainQueryTool(shared),
    get_column_stats: createGetColumnStatsTool({ schema: params.schema, state, emitters: params }),
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
/**
 * A compact, escalating step-budget reminder injected in the final few steps so
 * the model wraps up and writes its answer before it is cut off. `remaining` is
 * steps left including the current one (1 = this is the last step).
 */
function stepBudgetNudge(current: number, total: number, remaining: number): string {
  if (remaining <= 1) {
    return (
      `Step ${current} of ${total} — this is your FINAL step. Write the complete analyst answer NOW in prose using the results you already have; do NOT call any tools. ` +
      "If the analysis isn't fully complete, give the user what you found so far and tell them they can ask a follow-up to continue."
    );
  }
  if (remaining <= 2) {
    return (
      `Step ${current} of ${total} — you are almost out of steps. Run at most one more essential query, then write the final answer. ` +
      "Prefer answering now over gathering more data."
    );
  }
  return `Step ${current} of ${total} — ${remaining} steps left. Start converging: gather only what's essential, then write your final answer.`;
}

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
  // Adaptive step/attempt budget (SPEC-02 §2): explicit override wins, else the
  // cheap no-LLM complexity heuristic picks standard vs extended.
  const { budget: agentBudget, profile: budgetProfile } = resolveAgentBudget(params.question, params.budget);
  const state: AgentRunState = {
    blocks: [],
    transcript: [],
    sqlAttempts: 0,
    sampleCalls: 0,
    searchCalls: 0,
    budget: agentBudget,
  };
  const budget = resolveContextBudget(params.provider, params.model);
  const tools = buildTools(params, state);

  let streamedText = false;
  // Stable ordinal for idempotent per-call usage records within this run.
  let llmCallOrdinal = 0;

  // One streamed attempt. `recovery` re-runs with a shrunken context after a
  // true mid-run context overflow (SPEC-01 §1). `correction` appends a
  // verification-driven fix message and caps the extra steps (SPEC-02 §3).
  const streamOnce = async (
    candidate: LlmCandidate,
    apiKey: string,
    recovery = false,
    correction?: { draftAnswer: string; message: string; maxSteps: number },
  ): Promise<string> => {
    const candidateModel = candidate.model;
    const candidateProvider = candidate.provider;
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
      // Recovery already ran once; drop memory to reclaim tokens for the retry.
      recovery ? undefined : params.memory,
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
    if (correction) {
      // The draft answer, then the verifier's correction request (SPEC-02 §3).
      messages.push({ role: "assistant", content: correction.draftAnswer });
      messages.push({ role: "user", content: correction.message });
    }

    // Stable prefix first (system → schema), dynamic content (history/question)
    // after, for prompt caching (SPEC-01 §5). Anthropic gets an explicit
    // ephemeral cache marker on the system message; Google caches implicitly.
    const systemMessage: ModelMessage = {
      role: "system",
      content: system,
      ...(candidateProvider === "anthropic"
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
      model: getModel(candidateProvider, candidateModel, apiKey),
      messages: modelMessages,
      tools,
      stopWhen: stepCountIs(correction ? correction.maxSteps : state.budget.maxSteps),
      maxOutputTokens: 2500,
      temperature: 0.2,
      providerOptions: getThinkingProviderOptions(candidateProvider),
      abortSignal: params.abortSignal,
      // §4 tool-result compaction: digest older run_sql results before each step.
      prepareStep: ({ messages: stepMessages, stepNumber }) => {
        const compacted = compactToolResults(stepMessages, state);
        // Step-budget awareness: tell the model where it is in its budget so it
        // converges and writes the answer BEFORE running out of steps, rather than
        // getting cut off mid-tool-call. Injected only in the final few steps to
        // save tokens; a plain user note (not system) avoids the injection warning.
        const maxSteps = correction ? correction.maxSteps : state.budget.maxSteps;
        const remaining = Math.max(0, maxSteps - stepNumber);
        const messagesForStep =
          !correction && remaining <= 3
            ? [...compacted, { role: "user" as const, content: stepBudgetNudge(stepNumber + 1, maxSteps, remaining) }]
            : compacted;
        devLog("debug", "agent.context.assembled", "Per-step assembled context.", {
          stepNumber,
          recovery,
          remaining,
          stepTokens: messagesForStep.reduce(
            (sum, message) =>
              sum + estimateTokens(typeof message.content === "string" ? message.content : JSON.stringify(message.content)),
            0,
          ),
        });
        return { messages: messagesForStep };
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

    // Finalize fallback: if the model spent its whole step budget on tool calls /
    // reasoning and never wrote the answer (common on hard multi-query questions),
    // force one tool-free pass to write the final answer from the executed blocks —
    // instead of hard-failing with "The model returned no answer text."
    if (!text.trim() && state.blocks.length > 0) {
      devLog("info", "agent.finalize", "No answer after step budget; forcing a final answer from blocks.", {
        model: candidateModel,
        blocks: state.blocks.length,
      });
      const finalize = streamText({
        model: getModel(candidateProvider, candidateModel, apiKey),
        messages: [
          ...modelMessages,
          {
            role: "user",
            content:
              "You reached your step limit before writing an answer. Here are the query results already shown to the user as result blocks:\n" +
              `${renderBlockDigests(state)}\n\n` +
              "Write the final analyst answer now, in prose, using these results. Be specific and cite the key numbers. Do NOT call any tools or write SQL. " +
              "If the analysis is only partially complete, clearly say what you found so far and tell the user they can ask a follow-up question to continue the deeper analysis.",
          },
        ],
        maxOutputTokens: 1500,
        temperature: 0.2,
        providerOptions: getThinkingProviderOptions(candidateProvider),
        abortSignal: params.abortSignal,
      });
      for await (const part of finalize.fullStream) {
        if (part.type === "text-delta" && part.text) {
          text += part.text;
          streamedText = true;
          params.onTextDelta?.(part.text);
        } else if (part.type === "error") {
          throw part.error;
        }
      }
    }

    // Persist token usage (and log cache hits) when the provider reports them.
    // Best-effort: never fail the run over telemetry.
    try {
      const usage = await result.usage as {
        inputTokens?: number;
        outputTokens?: number;
        cachedInputTokens?: number;
        reasoningTokens?: number;
      } | undefined;
      const cachedInputTokens = usage?.cachedInputTokens;
      if (typeof cachedInputTokens === "number") {
        devLog("info", "agent.cache.usage", "Prompt cache usage.", {
          recovery,
          model: candidateModel,
          cachedInputTokens,
          inputTokens: usage?.inputTokens,
        });
      }
      if (params.usageContext) {
        await recordLlmUsage({
          userId: params.usageContext.userId,
          queryRunId: params.usageContext.queryRunId,
          connectionId: params.usageContext.connectionId,
          task: "agent",
          provider: candidateProvider,
          model: candidateModel,
          inputTokens: usage?.inputTokens,
          outputTokens: usage?.outputTokens,
          cachedInputTokens: usage?.cachedInputTokens,
          reasoningTokens: usage?.reasoningTokens ?? null,
          success: true,
          callOrdinal: llmCallOrdinal++,
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
    budgetProfile,
    budget: agentBudget,
    memoryInjected: Boolean(params.memory),
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

  // SPEC (key management): route through the shared cross-provider chain. The
  // caller's configured provider/model is the preferred primary (so the legacy
  // QUERYWISE_LLM_MODEL still steers it); the router then rotates every non-cooled
  // key of that model before advancing to the next model in the chain. Capped at
  // MAX_LLM_ATTEMPTS; rate-limited keys are cooled down so we stop hammering them.
  const preferred: LlmCandidate = { provider: params.provider, model: params.model };
  const plan = planAttempts(resolveTaskChain("agent", preferred)).slice(0, MAX_LLM_ATTEMPTS);
  if (plan.length === 0) {
    throw failure(new Error("No API keys configured for the agent model chain."));
  }
  // Remember which model/key actually produced the answer so the verification
  // correction pass (SPEC-02 §3) reuses the same one instead of replaying fallback.
  let used: RoutedAttempt = plan[0];

  for (let i = 0; i < plan.length; i += 1) {
    const attempt = plan[i];
    const candidate: LlmCandidate = { provider: attempt.provider, model: attempt.model };
    // Surface retry progress in the UI ("Retrying (2/5)") via the first-class
    // retry activity row. The first try is silent.
    if (i > 0) {
      params.onActivity?.({ kind: "retry", label: `Retrying (${i + 1}/${plan.length})` });
    }
    try {
      answer = await streamOnce(candidate, attempt.apiKey);
      used = attempt;
      break;
    } catch (error) {
      const sideEffects = streamedText || state.transcript.length > 0;

      // In-run recovery (SPEC-01 §1): one compact-and-retry attempt when a true
      // context overflow strikes after side effects (model fallback is then
      // unsafe). Rebuilds with compacted results, last-2-turn history, schema −1 tier.
      if (sideEffects && isContextOverflowError(error) && !recovered) {
        recovered = true;
        devLog("info", "agent.context.recovery", "Attempting compact-and-retry after context overflow.", {
          model: attempt.model,
          blocks: state.blocks.length,
        });
        try {
          answer = await streamOnce(candidate, attempt.apiKey, true);
          used = attempt;
          break;
        } catch (recoveryError) {
          throw failure(recoveryError);
        }
      }

      if (isRateLimitError(error)) markKeyCooled(attempt.provider, attempt.apiKey);

      // Side effects or a non-retryable error means we can't safely replay.
      if (sideEffects || !isRetryableError(error)) throw failure(error);
      const isLast = i === plan.length - 1;
      if (isLast) throw failure(error);
      // Rotating to another KEY of the same model is always fine for a retryable
      // error; crossing to the next MODEL requires a fallback-worthy error.
      const next = plan[i + 1];
      const switchingModel = next.provider !== attempt.provider || next.model !== attempt.model;
      if (switchingModel && !shouldFallbackToAnotherModel(error)) throw failure(error);
    }
  }

  if (!answer.trim()) {
    const lastThought = state.transcript
      .filter((t) => t.tool === "thinking")
      .map((t) => t.summary)
      .pop();

    if (lastThought && lastThought.trim()) {
      answer = lastThought.trim();
    } else if (state.blocks.length > 0) {
      answer = "Here is the analysis based on the executed queries.";
    } else {
      throw new AgentExecutionError(
        "The model returned no answer text.",
        { mode: "conversation", blocks: state.blocks, transcript: state.transcript },
      );
    }
  }

  // Self-verification pass (SPEC-02 §3): checks the drafted answer against the
  // block data, runs a bounded correction on issues, else appends a caveat.
  // Skipped for trivial/KPI questions and when disabled, so it never adds
  // latency where it cannot help.
  answer = await runSelfVerification({
    question: params.question,
    mode: state.blocks.length > 0 ? "query" : "conversation",
    answer,
    state,
    provider: params.provider,
    model: params.model,
    apiKeys: params.apiKeys,
    abortSignal: params.abortSignal,
    emitters: params,
    runCorrection: (message, maxSteps) =>
      streamOnce({ provider: used.provider, model: used.model }, used.apiKey, false, {
        draftAnswer: answer,
        message,
        maxSteps,
      }),
  });

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
