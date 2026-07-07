import { tool } from "ai";
import { z } from "zod";
import type { BoundedQueryResult } from "@query-wise/shared/types";
import { devLog } from "@query-wise/shared/observability";
import { resolveChartConfig } from "@/lib/charts";
import { createResultPreview } from "@/lib/query/preview";
import { getErrorMessage } from "../../client";
import {
  MODEL_ROW_SLICE,
  type AgentRunState,
  type AnalystAgentEmitters,
  type AnalystAgentRuntime,
} from "../types";

/** Compact slice fed back to the model; the UI receives the full bounded result. */
export function compactResultForModel(result: BoundedQueryResult) {
  return {
    columns: result.columns.map((column) => column.name),
    rows: result.rows.slice(0, MODEL_ROW_SLICE),
    rowCount: result.returnedRowCount,
    totalRowCount: result.totalRowCount,
    truncated: result.truncated || result.rows.length > MODEL_ROW_SLICE,
    executionTimeMs: result.executionTimeMs,
  };
}

export function createRunSqlTool(deps: {
  state: AgentRunState;
  runtime: AnalystAgentRuntime;
  emitters: AnalystAgentEmitters;
}) {
  const { state, runtime, emitters } = deps;
  return tool({
    description:
      "Execute a single read-only PostgreSQL SELECT/WITH statement against the connected database. " +
      "Returns columns and a row sample; the user sees the full result as a data block. " +
      "Errors describe what to fix — correct the SQL and retry.",
    inputSchema: z.object({
      sql: z.string().trim().min(1),
      purpose: z.string().trim().min(1).max(120).describe("Short user-facing label, e.g. 'Top products by revenue'"),
    }),
    execute: async ({ sql, purpose }) => {
      if (state.sqlAttempts >= state.budget.maxSqlAttempts) {
        return { error: "Query budget exhausted. Answer with the results you already have." };
      }
      state.sqlAttempts += 1;
      const callId = `run_sql-${state.sqlAttempts}`;
      const start = Date.now(); // only for logging
      devLog("debug", "agent.tool.run_sql.started", `Starting run_sql: ${purpose}`, { sql, purpose });
      emitters.onActivity?.({ kind: "tool-call", tool: "run_sql", callId, label: `Running: ${purpose}`, input: { sql, purpose } });

      const validation = await runtime.validateSql(sql);
      if (!validation.valid || !validation.normalizedSql) {
        emitters.onSqlPreview?.({ blockIndex: null, sql, purpose, validation: "blocked" });
        const reason = validation.violations.join("; ") || "unspecified violation";
        devLog("debug", "agent.tool.run_sql.blocked", `run_sql blocked: ${reason}`, { sql, reason, durationMs: Date.now() - start });
        emitters.onActivity?.({ kind: "retry", tool: "run_sql", callId, label: `Blocked: ${reason.slice(0, 120)}` });
        state.transcript.push({ tool: "run_sql", input: { sql, purpose }, outcome: "error", summary: `blocked: ${reason}` });
        return { error: `Blocked by the read-only safety policy: ${reason}. Rewrite the SQL to comply.` };
      }

      let result: BoundedQueryResult;
      try {
        result = await runtime.executeSql(validation.normalizedSql);
      } catch (error) {
        const message = getErrorMessage(error) || "Query execution failed.";
        devLog("error", "agent.tool.run_sql.error", `run_sql failed: ${message}`, { sql, durationMs: Date.now() - start }, error);
        emitters.onActivity?.({ kind: "retry", tool: "run_sql", callId, label: `Query failed: ${message.slice(0, 120)}` });
        state.transcript.push({ tool: "run_sql", input: { sql, purpose }, outcome: "error", summary: message });
        return { error: `Database error: ${message}. Fix the SQL and retry.` };
      }

      const blockIndex = state.blocks.length;
      // Resolve a heuristic default chart right away so the streamed block is
      // immediately renderable; a later set_chart call refines it.
      const chartConfig = resolveChartConfig(
        {
          columns: result.columns.map((column) => column.name),
          rows: result.rows,
          rowCount: result.returnedRowCount,
          executionTimeMs: result.executionTimeMs,
        },
        null,
      );
      state.blocks.push({ index: blockIndex, purpose, sql, result, chartHint: null, chartConfig });
      emitters.onSqlPreview?.({ blockIndex, sql, purpose, validation: "valid" });
      emitters.onQueryStats?.({
        blockIndex,
        rowCount: result.returnedRowCount,
        executionTimeMs: result.executionTimeMs,
        truncated: result.truncated,
      });
      try {
        emitters.onBlockData?.({
          blockIndex,
          purpose,
          sql,
          preview: createResultPreview(result),
          rowCount: result.returnedRowCount,
          executionTimeMs: result.executionTimeMs,
          truncated: result.truncated,
          chartConfig,
        });
      } catch {
        // Preview overflow must not fail the run; the block still arrives with the persisted message.
      }
      emitters.onActivity?.({
        kind: "tool-result",
        tool: "run_sql",
        callId,
        blockIndex,
        label: `${result.returnedRowCount} rows in ${result.executionTimeMs}ms`,
      });
      devLog("debug", "agent.tool.run_sql.completed", `run_sql completed`, { 
        rowCount: result.returnedRowCount, 
        executionTimeMs: result.executionTimeMs,
        durationMs: Date.now() - start,
      });
      state.transcript.push({
        tool: "run_sql",
        input: { sql, purpose },
        outcome: "ok",
        summary: `${result.returnedRowCount.toLocaleString()} rows in ${result.executionTimeMs}ms`,
        blockIndex,
      });
      return { blockIndex, ...compactResultForModel(result) };
    },
  });
}
