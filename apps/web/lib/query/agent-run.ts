import "server-only";
import type { Prisma, QueryRun } from "@prisma/client";
import { runAnalystAgent } from "@/lib/llm/agent";
import type {
  AgentResultBlock,
  AnalystAgentResult,
  AnalystAgentRuntime,
} from "@/lib/llm/agent";
import { AGENT_BUDGET_PROFILES } from "@/lib/llm/agent/types";
import { getPlanForUser } from "@/lib/plans";
import { finalizeQueryRunUsage, recordMetricEvent } from "@query-wise/shared/metrics";
import { completeQueryRun, transitionQueryRun } from "@/lib/query-runs";
import { getBackendLlmConfig } from "@/lib/llm/client";
import { devLog } from "@query-wise/shared/observability";
import type { ChartConfig, ProviderQuery, QueryResultBlock } from "@query-wise/shared/types";
import type { ChatMessage, SchemaInfo } from "@/types";
import { createResultPreview } from "./preview";
import type { QueryRuntimeContext, QueryRuntimeDependencies } from "./runtime";
import { statusEvent, type QueryStreamEmitter } from "./sse";
import { throwIfQueryRunAborted } from "./cancellation";
import { elapsedMs, generateAndPersistTitle, toV2ChartConfig } from "./run-helpers";
import { adaptiveRetrievalLimit, retrieveCandidateTables } from "@/lib/retrieval/retrieval";
import {
  getConversationAnalysisState,
  toAgentMemoryContext,
  updateConversationMemory,
} from "@/lib/conversations";

/**
 * Relevance pre-seeding (SPEC-01 §3): rank the schema's tables against the
 * question so the context assembler can fill Tier B with the most relevant
 * tables. Uses pgvector when embeddings exist, with lexical fallback; on small
 * schemas (≤15 tables) retrieval is skipped and every table is a candidate.
 * Never throws — a failed ranking simply yields schema-order Tier-B selection.
 */
async function rankTablesForQuestion(schema: SchemaInfo, question: string): Promise<string[]> {
  try {
    const limit = adaptiveRetrievalLimit(schema.tables.length);
    const candidates = await retrieveCandidateTables({ schema, question, limit });
    return candidates.map((candidate) => candidate.tableName);
  } catch {
    return [];
  }
}

/**
 * Analyst-agent path for the durable query run (docs/AGENTIC_ARCHITECTURE.md
 * §3, §6 Phase 2). This is the only query path, invoked by the orchestrator
 * after the shared setup (run load, schema/history load, status transitions).
 * The run arrives already transitioned to "generating"; the agent loop runs
 * here, then this module drives persisting → completed.
 */

/**
 * Parse the root plan node out of `EXPLAIN (FORMAT JSON)` output. Postgres
 * returns a single row `{ "QUERY PLAN": [{ Plan: { "Total Cost", "Plan Rows" } }] }`;
 * the pg driver may hand it back already parsed or as a JSON string. Returns
 * null when neither Total Cost nor Plan Rows can be located.
 */
function parseExplainPlan(rows: Array<Record<string, unknown>>): { totalCost: number; planRows: number } | null {
  const first = rows[0];
  if (!first) return null;
  let planColumn = first["QUERY PLAN"] ?? Object.values(first)[0];
  if (typeof planColumn === "string") {
    try {
      planColumn = JSON.parse(planColumn);
    } catch {
      return null;
    }
  }
  const root = Array.isArray(planColumn) ? planColumn[0] : planColumn;
  const plan = (root as { Plan?: Record<string, unknown> } | undefined)?.Plan;
  if (!plan) return null;
  const totalCost = Number(plan["Total Cost"]);
  const planRows = Number(plan["Plan Rows"]);
  if (!Number.isFinite(totalCost) && !Number.isFinite(planRows)) return null;
  return {
    totalCost: Number.isFinite(totalCost) ? totalCost : 0,
    planRows: Number.isFinite(planRows) ? planRows : 0,
  };
}

/** Wraps the connection-scoped runtime as the agent's SQL contract. */
function createAgentRuntime(
  runtime: QueryRuntimeDependencies,
  context: QueryRuntimeContext,
  abortSignal: AbortSignal,
): AnalystAgentRuntime {
  return {
    async validateSql(sql) {
      const query: ProviderQuery = { kind: "sql", dialectId: "postgresql", text: sql };
      const validation = await runtime.validateReadQuery(context, query);
      return {
        valid: validation.valid,
        normalizedSql: validation.normalizedQuery?.text ?? null,
        violations: validation.violations.map((violation) => `${violation.code}: ${violation.message}`),
      };
    },
    async executeSql(normalizedSql) {
      const query: ProviderQuery = { kind: "sql", dialectId: "postgresql", text: normalizedSql };
      return runtime.executeValidatedReadQuery(context, query, abortSignal);
    },
    async explainSql(sql) {
      const rows = await runtime.explainReadQuery(context, sql, abortSignal);
      return parseExplainPlan(rows);
    },
  };
}

/** Block-0 chart in the V2 metadata shape kept for backward compatibility. */
function blockV2ChartConfig(block: AgentResultBlock | undefined): ChartConfig | null {
  return block?.chartConfig ? toV2ChartConfig(block.chartConfig) : null;
}

/** Agent transcript remains message metadata for debugging and reproducibility. */
function buildAgentMetadata(result: AnalystAgentResult): Prisma.InputJsonValue {
  const metadata: Record<string, unknown> = {
    schemaVersion: 1,
    agentV3: {
      transcript: result.transcript,
    },
  };
  const block0Chart = blockV2ChartConfig(result.blocks[0]);
  if (block0Chart) metadata.chartConfig = block0Chart;
  return metadata as unknown as Prisma.InputJsonValue;
}

/** Shape bounded agent results for first-class query-run persistence. */
function buildResultBlocks(blocks: AgentResultBlock[]): QueryResultBlock[] {
  return blocks.map((block) => {
    const resultPreview = createResultPreview(block.result);
    return {
      index: block.index,
      purpose: block.purpose,
      sql: block.sql,
      validation: "valid",
      resultPreview,
      rowCount: block.result.returnedRowCount,
      totalRowCount: block.result.totalRowCount,
      truncated: block.result.truncated || resultPreview.truncated,
      executionTimeMs: block.result.executionTimeMs,
      chartConfig: blockV2ChartConfig(block),
    };
  });
}

/** Mirror block 0 into the legacy single-result columns (dashboards, shares). */
function buildLegacyMirror(block: QueryResultBlock | undefined) {
  if (!block) return {};
  const query: ProviderQuery = { kind: "sql", dialectId: "postgresql", text: block.sql };
  return {
    generatedQuery: query as unknown as Prisma.InputJsonValue,
    resultPreview: block.resultPreview as unknown as Prisma.InputJsonValue,
    returnedRowCount: block.rowCount,
    totalRowCount: block.totalRowCount,
    truncated: block.truncated,
    executionTimeMs: block.executionTimeMs,
  };
}

export async function runAgentQueryRun(input: {
  run: QueryRun;
  context: QueryRuntimeContext;
  runtime: QueryRuntimeDependencies;
  schema: SchemaInfo;
  history: ChatMessage[];
  question: string;
  emit?: QueryStreamEmitter;
  abortSignal: AbortSignal;
}): Promise<QueryRun> {
  const { emit, abortSignal } = input;
  let run = input.run;
  const llmConfig = getBackendLlmConfig();
  const agentRuntime = createAgentRuntime(input.runtime, input.context, abortSignal);
  const agentStartedAt = Date.now();

  const [rankedTables, analysisState, plan] = await Promise.all([
    rankTablesForQuestion(input.schema, input.question),
    // SPEC-02 §4: distilled cross-turn memory, injected within the history budget.
    getConversationAnalysisState(run.conversationId).catch(() => undefined),
    getPlanForUser(run.ownerUserId),
  ]);

  // Plan gating: Free forces the standard agent budget (extended stays Pro-only)
  // and routes onto the fast model tier. Pro lets the question heuristic decide.
  const forcedBudget =
    plan.limits.maxAgentBudgetProfile === "standard" ? AGENT_BUDGET_PROFILES.standard : undefined;

  const result = await runAnalystAgent({
    question: input.question,
    history: input.history,
    schema: input.schema,
    rankedTables,
    memory: toAgentMemoryContext(analysisState),
    runtime: agentRuntime,
    provider: llmConfig.provider,
    model: llmConfig.model,
    apiKeys: llmConfig.apiKeys,
    budget: forcedBudget,
    usageContext: {
      userId: run.ownerUserId,
      queryRunId: run.id,
      connectionId: run.connectionId,
    },
    abortSignal,
    onTextDelta: (chunk) => emit?.("text-delta", { chunk }),
    onActivity: (event) => emit?.("activity", event),
    onSqlPreview: (event) =>
      emit?.("sql-preview", {
        blockIndex: event.blockIndex,
        dialectId: "postgresql",
        language: "sql",
        text: event.sql,
        purpose: event.purpose,
        validation: event.validation,
      }),
    onQueryStats: (event) =>
      emit?.("query-stats", {
        blockIndex: event.blockIndex,
        rowCount: event.rowCount,
        executionTimeMs: event.executionTimeMs,
        truncated: event.truncated,
      }),
    onBlockData: (event) =>
      emit?.("block-data", {
        blockIndex: event.blockIndex,
        purpose: event.purpose,
        sql: event.sql,
        preview: event.preview,
        rowCount: event.rowCount,
        executionTimeMs: event.executionTimeMs,
        truncated: event.truncated,
        chartConfig: toV2ChartConfig(event.chartConfig),
      }),
    onChartConfig: (event) =>
      emit?.("chart-config", {
        blockIndex: event.blockIndex,
        chartConfig: toV2ChartConfig(event.chartConfig),
      }),
  });
  devLog("info", "query.run.agent-completed", "Analyst agent produced a result.", {
    queryRunId: run.id,
    durationMs: elapsedMs(agentStartedAt),
    mode: result.mode,
    blockCount: result.blocks.length,
  });

  throwIfQueryRunAborted(abortSignal);
  run = await transitionQueryRun(run.id, "persisting");
  throwIfQueryRunAborted(abortSignal);

  const resultBlocks = buildResultBlocks(result.blocks);
  run = await completeQueryRun({
    queryRunId: run.id,
    assistantContent: result.answer,
    metadata: buildAgentMetadata(result),
    resultBlocks,
    ...buildLegacyMirror(resultBlocks[0]),
  });
  emit?.("completed", { status: run.status, statusVersion: run.statusVersion });

  // Metrics (best-effort, never blocks the response): fold agent metadata into the
  // per-run aggregate, bump the succeeded question counters, and emit events.
  const chartBlock = result.blocks.find((block) => {
    const type = (block.chartConfig as { type?: string } | null)?.type;
    return Boolean(type) && type !== "table" && type !== "none";
  });
  const sqlAttempts = result.transcript.filter((step) => step.tool === "run_sql").length;
  void finalizeQueryRunUsage({
    queryRunId: run.id,
    userId: run.ownerUserId,
    agentSteps: result.transcript.length,
    sqlAttempts,
    budgetProfile: forcedBudget ? "standard" : undefined,
    chartGenerated: Boolean(chartBlock),
    chartType: (chartBlock?.chartConfig as { type?: string } | null)?.type ?? null,
  });
  if (chartBlock) {
    void recordMetricEvent({
      userId: run.ownerUserId,
      eventType: "chart.generated",
      resourceType: "query-run",
      resourceId: run.id,
      queryRunId: run.id,
      payload: { chartType: (chartBlock.chartConfig as { type?: string } | null)?.type ?? null },
    });
  }

  void generateAndPersistTitle({
    conversationId: run.conversationId,
    userMessage: input.question,
    assistantMessage: result.answer,
    abortSignal,
    queryRunId: run.id,
  });

  // SPEC-02 §4: refresh distilled conversation memory off the critical path.
  // Fire-and-forget, exactly like title generation — never blocks the response.
  void updateConversationMemory({
    conversationId: run.conversationId,
    question: input.question,
    answer: result.answer,
    blocks: result.blocks,
    abortSignal,
  });

  devLog("info", "query.run.agent-persisted", "Analyst agent run persisted.", {
    queryRunId: run.id,
    mode: result.mode,
    blockCount: result.blocks.length,
  });
  return run;
}
