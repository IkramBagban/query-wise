import { tool } from "ai";
import { z } from "zod";
import type { BoundedQueryResult } from "@query-wise/shared/types";
import { devLog } from "@query-wise/shared/observability";
import { resolveChartConfig } from "@/lib/charts";
import { createResultPreview } from "@/lib/query/preview";
import { getErrorMessage } from "../../client";
import { computeColumnStats } from "../column-stats";
import {
  MODEL_ROW_SLICE,
  type AgentRunState,
  type AnalystAgentEmitters,
  type AnalystAgentRuntime,
} from "../types";

/** SPEC-09 §3.1: quiet probes get a smaller row slice than block queries. */
const QUIET_MODEL_ROW_SLICE = 20;

/**
 * Compact slice fed back to the model; the UI receives the full bounded result.
 * SPEC-10 §2.1: `columnStats` is computed over ALL returned rows (not the slice)
 * so the model — and every later digest/verifier step — can reason about the
 * true min/max/mean even when the row sample elides the extreme.
 */
export function compactResultForModel(result: BoundedQueryResult, slice: number = MODEL_ROW_SLICE) {
  return {
    columns: result.columns.map((column) => column.name),
    rows: result.rows.slice(0, slice),
    rowCount: result.returnedRowCount,
    totalRowCount: result.totalRowCount,
    truncated: result.truncated || result.rows.length > slice,
    executionTimeMs: result.executionTimeMs,
    columnStats: computeColumnStats(result),
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
      "columnStats are computed over ALL returned rows — trust them over eyeballing the row sample. " +
      "Errors describe what to fix — correct the SQL and retry. " +
      "Set presentation:'quiet' to run a PROBE whose result the user does NOT see as a card — " +
      "use it for existence checks, sanity counts, and shape exploration before committing to the real query. " +
      "Final answers must come from block (default) queries.",
    inputSchema: z.object({
      sql: z.string().trim().min(1),
      purpose: z.string().trim().min(1).max(120).describe("Short user-facing label, e.g. 'Top products by revenue'"),
      presentation: z.enum(["block", "quiet"]).default("block")
        .describe("'block' (default) becomes a user-visible result card; 'quiet' is an internal probe with no card."),
    }),
    execute: async ({ sql, purpose, presentation }) => {
      const isQuiet = presentation === "quiet";
      // SPEC-09 §3.2: quiet probes draw from a SEPARATE budget so probing never
      // competes with answering.
      if (isQuiet) {
        if (state.quietQueries >= state.budget.maxQuietQueries) {
          return { error: "Quiet-probe budget exhausted. Run the real (block) query or answer with what you have." };
        }
        state.quietQueries += 1;
      } else {
        if (state.sqlAttempts >= state.budget.maxSqlAttempts) {
          return { error: "Query budget exhausted. Answer with the results you already have." };
        }
        state.sqlAttempts += 1;
      }
      const callId = isQuiet ? `run_sql-quiet-${state.quietQueries}` : `run_sql-${state.sqlAttempts}`;
      const start = Date.now(); // only for logging
      devLog("debug", "agent.tool.run_sql.started", `Starting run_sql: ${purpose}`, { sql, purpose, presentation });
      emitters.onActivity?.({ kind: "tool-call", tool: "run_sql", callId, label: `${isQuiet ? "Probing" : "Running"}: ${purpose}`, input: { sql, purpose, presentation } });

      const validation = await runtime.validateSql(sql);
      if (!validation.valid || !validation.normalizedSql) {
        // Quiet probes never surface a block SQL preview.
        if (!isQuiet) emitters.onSqlPreview?.({ blockIndex: null, sql, purpose, validation: "blocked" });
        const reason = validation.violations.join("; ") || "unspecified violation";
        devLog("debug", "agent.tool.run_sql.blocked", `run_sql blocked: ${reason}`, { sql, reason, durationMs: Date.now() - start });
        emitters.onActivity?.({ kind: "retry", tool: "run_sql", callId, label: `Blocked: ${reason.slice(0, 120)}` });
        state.transcript.push({ tool: "run_sql", input: { sql, purpose, presentation }, outcome: "error", summary: `blocked: ${reason}` });
        return { error: `Blocked by the read-only safety policy: ${reason}. Rewrite the SQL to comply.` };
      }

      // Dedupe identical block re-runs (the verification correction pass is told it
      // may "re-run SQL if needed" and often re-issues the SAME query). Reuse the
      // existing block — no duplicate card, no wasted execution, no consumed budget.
      // The reuse is intentionally silent (a tool-result activity with NO blockIndex
      // and no transcript step) so neither the live nor the finalized timeline draws
      // the block twice.
      if (!isQuiet) {
        const existing = state.blocks.find((candidate) => candidate.normalizedSql === validation.normalizedSql);
        if (existing) {
          state.sqlAttempts -= 1;
          emitters.onActivity?.({
            kind: "tool-result",
            tool: "run_sql",
            callId,
            label: `Reused earlier result (${existing.result.returnedRowCount} rows)`,
          });
          devLog("debug", "agent.tool.run_sql.reused", `run_sql reused block ${existing.index}`, { blockIndex: existing.index });
          return { blockIndex: existing.index, reused: true, ...compactResultForModel(existing.result) };
        }
      }

      let result: BoundedQueryResult;
      try {
        result = await runtime.executeSql(validation.normalizedSql);
      } catch (error) {
        const message = getErrorMessage(error) || "Query execution failed.";
        devLog("error", "agent.tool.run_sql.error", `run_sql failed: ${message}`, { sql, durationMs: Date.now() - start }, error);
        emitters.onActivity?.({ kind: "retry", tool: "run_sql", callId, label: `Query failed: ${message.slice(0, 120)}` });
        state.transcript.push({ tool: "run_sql", input: { sql, purpose, presentation }, outcome: "error", summary: message });
        return { error: `Database error: ${message}. Fix the SQL and retry.` };
      }

      // SPEC-09 §3.1: a quiet probe never becomes a block — no state.blocks push and
      // none of the block-facing emissions (onBlockData/onQueryStats/onSqlPreview).
      // The transcript still records the statement, so provenance stays auditable.
      if (isQuiet) {
        emitters.onActivity?.({
          kind: "tool-result",
          tool: "run_sql",
          callId,
          label: `Probed ${result.returnedRowCount} rows in ${result.executionTimeMs}ms`,
        });
        devLog("debug", "agent.tool.run_sql.completed", `run_sql (quiet) completed`, {
          rowCount: result.returnedRowCount,
          executionTimeMs: result.executionTimeMs,
          durationMs: Date.now() - start,
        });
        state.transcript.push({
          tool: "run_sql",
          input: { sql, purpose, presentation },
          outcome: "ok",
          summary: `probed ${result.returnedRowCount.toLocaleString()} rows in ${result.executionTimeMs}ms`,
        });
        return { quiet: true, ...compactResultForModel(result, QUIET_MODEL_ROW_SLICE) };
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
      state.blocks.push({ index: blockIndex, purpose, sql, normalizedSql: validation.normalizedSql, result, chartHint: null, chartConfig });
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
        input: { sql, purpose, presentation },
        outcome: "ok",
        summary: `${result.returnedRowCount.toLocaleString()} rows in ${result.executionTimeMs}ms`,
        blockIndex,
      });
      return { blockIndex, ...compactResultForModel(result) };
    },
  });
}
