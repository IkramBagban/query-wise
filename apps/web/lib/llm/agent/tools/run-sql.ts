import { tool } from "ai";
import { z } from "zod";
import type { BoundedQueryResult } from "@query-wise/shared/types";
import { getErrorMessage } from "../../client";
import {
  AGENT_BUDGETS,
  type AgentRunState,
  type AnalystAgentEmitters,
  type AnalystAgentRuntime,
} from "../types";

/** Compact slice fed back to the model; the UI receives the full bounded result. */
export function compactResultForModel(result: BoundedQueryResult) {
  return {
    columns: result.columns.map((column) => column.name),
    rows: result.rows.slice(0, AGENT_BUDGETS.modelRowSlice),
    rowCount: result.returnedRowCount,
    totalRowCount: result.totalRowCount,
    truncated: result.truncated || result.rows.length > AGENT_BUDGETS.modelRowSlice,
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
      if (state.sqlAttempts >= AGENT_BUDGETS.maxSqlAttempts) {
        return { error: "Query budget exhausted. Answer with the results you already have." };
      }
      state.sqlAttempts += 1;
      emitters.onActivity?.({ kind: "tool-call", tool: "run_sql", label: `Running: ${purpose}`, input: { sql, purpose } });

      const validation = await runtime.validateSql(sql);
      if (!validation.valid || !validation.normalizedSql) {
        emitters.onSqlPreview?.({ blockIndex: null, sql, purpose, validation: "blocked" });
        const reason = validation.violations.join("; ") || "unspecified violation";
        state.transcript.push({ tool: "run_sql", input: { sql, purpose }, outcome: "error", summary: `blocked: ${reason}` });
        return { error: `Blocked by the read-only safety policy: ${reason}. Rewrite the SQL to comply.` };
      }

      let result: BoundedQueryResult;
      try {
        result = await runtime.executeSql(validation.normalizedSql);
      } catch (error) {
        const message = getErrorMessage(error) || "Query execution failed.";
        emitters.onActivity?.({ kind: "retry", tool: "run_sql", label: `Query failed: ${message.slice(0, 120)}` });
        state.transcript.push({ tool: "run_sql", input: { sql, purpose }, outcome: "error", summary: message });
        return { error: `Database error: ${message}. Fix the SQL and retry.` };
      }

      const blockIndex = state.blocks.length;
      state.blocks.push({ index: blockIndex, purpose, sql, result, chartHint: null, chartConfig: null });
      emitters.onSqlPreview?.({ blockIndex, sql, purpose, validation: "valid" });
      emitters.onQueryStats?.({
        blockIndex,
        rowCount: result.returnedRowCount,
        executionTimeMs: result.executionTimeMs,
        truncated: result.truncated,
      });
      emitters.onActivity?.({
        kind: "tool-result",
        tool: "run_sql",
        blockIndex,
        label: `${result.returnedRowCount} rows in ${result.executionTimeMs}ms`,
      });
      state.transcript.push({
        tool: "run_sql",
        input: { sql, purpose },
        outcome: "ok",
        summary: `block ${blockIndex}: ${result.returnedRowCount} rows`,
      });
      return { blockIndex, ...compactResultForModel(result) };
    },
  });
}
