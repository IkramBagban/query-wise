import "server-only";
import type { Prisma, QueryRun } from "@prisma/client";
import { runAnalystAgent } from "@/lib/llm/agent";
import type {
  AgentResultBlock,
  AnalystAgentResult,
  AnalystAgentRuntime,
} from "@/lib/llm/agent";
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

/**
 * V3 analyst-agent path for the durable query run (docs/AGENTIC_ARCHITECTURE.md
 * §3, §6 Phase 2). Selected by the `QUERYWISE_AGENT_V3` flag in the orchestrator
 * after the shared setup (run load, schema/history load, status transitions).
 * The run arrives already transitioned to "generating"; the agent loop runs
 * here, then this module drives persisting → completed.
 */

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

  const result = await runAnalystAgent({
    question: input.question,
    history: input.history,
    schema: input.schema,
    runtime: agentRuntime,
    provider: llmConfig.provider,
    model: llmConfig.model,
    apiKeys: llmConfig.apiKeys,
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

  void generateAndPersistTitle({
    conversationId: run.conversationId,
    userMessage: input.question,
    assistantMessage: result.answer,
    abortSignal,
    queryRunId: run.id,
  });

  devLog("info", "query.run.agent-persisted", "Analyst agent run persisted.", {
    queryRunId: run.id,
    mode: result.mode,
    blockCount: result.blocks.length,
  });
  return run;
}
