import { tool } from "ai";
import { z } from "zod";
import type { SchemaInfo } from "@/types";
import { devLog } from "@query-wise/shared/observability";
import type { AgentRunState, AnalystAgentEmitters } from "../types";
import { findTable, suggestTables } from "./schema-lookup";

/**
 * `get_column_stats` (SPEC-02 §1.3): return cached per-column statistics from
 * the SPEC-03 profile store (distinct count, null fraction, min/max, top
 * values). These are cached, so this replaces many live `sample_values` calls —
 * but `sample_values` is kept for when the agent needs fresh, exact literals.
 * Falls back to the snapshot's sampled top values / row count when a column has
 * no profile (older snapshots, or columns the profiler skipped).
 */
export function createGetColumnStatsTool(deps: {
  schema: SchemaInfo;
  state: AgentRunState;
  emitters: AnalystAgentEmitters;
}) {
  const { schema, state, emitters } = deps;
  return tool({
    description:
      "Get cached statistics for one column: distinct count, null fraction, min/max, and top values. " +
      "Cheaper than sample_values (no live query). Use it to understand a column's shape and range; " +
      "use sample_values only when you need exact, current filter literals.",
    inputSchema: z.object({
      table: z.string().trim().min(1),
      column: z.string().trim().min(1),
    }),
    execute: async ({ table, column }) => {
      const callId = `get_column_stats-${state.transcript.length}`;
      devLog("debug", "agent.tool.get_column_stats.started", `Stats for ${table}.${column}`, { table, column });
      emitters.onActivity?.({ kind: "tool-call", tool: "get_column_stats", callId, label: `Stats for ${table}.${column}`, input: { table, column } });

      const schemaTable = findTable(schema, table);
      if (!schemaTable) {
        emitters.onActivity?.({ kind: "retry", tool: "get_column_stats", callId, label: `Unknown table "${table}"` });
        state.transcript.push({ tool: "get_column_stats", input: { table, column }, outcome: "error", summary: `unknown table ${table}` });
        return { error: `Unknown table "${table}".`, suggestions: suggestTables(schema, table) };
      }
      const schemaColumn = schemaTable.columns.find((c) => c.name.toLowerCase() === column.trim().toLowerCase());
      if (!schemaColumn) {
        emitters.onActivity?.({ kind: "retry", tool: "get_column_stats", callId, label: `No column "${column}" on ${schemaTable.name}` });
        state.transcript.push({ tool: "get_column_stats", input: { table, column }, outcome: "error", summary: `no column ${column}` });
        return {
          error: `Table ${schemaTable.name} has no column "${column}".`,
          availableColumns: schemaTable.columns.map((c) => c.name),
        };
      }

      const stats = schemaColumn.stats;
      // Fall back to whatever the snapshot carried when no profile exists.
      const fallbackTopValues = schemaColumn.topValues?.map((item) => item.value);
      const profiled = Boolean(stats);
      const response = {
        table: schemaTable.name,
        column: schemaColumn.name,
        type: schemaColumn.fullType ?? schemaColumn.type,
        nullable: schemaColumn.nullable,
        distinctCount: stats?.distinctCount,
        nullFraction: stats?.nullFraction,
        min: stats?.min ?? schemaColumn.range?.min,
        max: stats?.max ?? schemaColumn.range?.max,
        topValues: stats?.topValues ?? (fallbackTopValues?.length ? fallbackTopValues.map((value) => ({ value })) : undefined),
        tableRowCount: schemaTable.rowCount,
        source: profiled ? ("profile" as const) : ("snapshot-fallback" as const),
        note: profiled
          ? "Cached profile statistics. For exact current literals, use sample_values."
          : "No cached profile for this column; showing sampled values / range from the snapshot. Use sample_values for exact literals.",
      };
      state.transcript.push({
        tool: "get_column_stats",
        input: { table: schemaTable.name, column: schemaColumn.name },
        outcome: "ok",
        summary: profiled ? "profile stats" : "snapshot fallback",
      });
      emitters.onActivity?.({ kind: "tool-result", tool: "get_column_stats", callId, label: profiled ? "profile stats" : "snapshot fallback" });
      devLog("debug", "agent.tool.get_column_stats.completed", "get_column_stats completed", { profiled });
      return response;
    },
  });
}
