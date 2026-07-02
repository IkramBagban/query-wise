import { tool } from "ai";
import { z } from "zod";
import type { SchemaInfo } from "@/types";
import { getErrorMessage } from "../../client";
import {
  AGENT_BUDGETS,
  type AgentRunState,
  type AnalystAgentEmitters,
  type AnalystAgentRuntime,
} from "../types";
import { findTable, quoteColumnName, quoteTableName, suggestTables } from "./schema-lookup";

const SAMPLE_SCAN_LIMIT = 5000;
const MAX_SAMPLE_VALUES = 20;

/** Tool-owned, bounded sampling SQL — O(small) regardless of table size (arch §4.2). */
function buildSampleSql(tableName: string, columnName: string, limit: number): string {
  const table = quoteTableName(tableName);
  const column = quoteColumnName(columnName);
  return (
    `SELECT DISTINCT ${column} AS value FROM ` +
    `(SELECT ${column} FROM ${table} WHERE ${column} IS NOT NULL LIMIT ${SAMPLE_SCAN_LIMIT}) sample_source ` +
    `LIMIT ${limit}`
  );
}

export function createSampleValuesTool(deps: {
  schema: SchemaInfo;
  state: AgentRunState;
  runtime: AnalystAgentRuntime;
  emitters: AnalystAgentEmitters;
}) {
  const { schema, state, runtime, emitters } = deps;
  return tool({
    description:
      "Fetch up to 20 distinct real values of a column. Use it to get exact filter literals " +
      "(status names, categories, casing) before or after a filter matches 0 rows.",
    inputSchema: z.object({
      table: z.string().trim().min(1),
      column: z.string().trim().min(1),
      limit: z.number().int().min(1).max(MAX_SAMPLE_VALUES).default(MAX_SAMPLE_VALUES),
    }),
    execute: async ({ table, column, limit }) => {
      if (state.sampleCalls >= AGENT_BUDGETS.maxSampleCalls) {
        return { error: "Sampling budget exhausted. Proceed with what you know." };
      }
      state.sampleCalls += 1;
      emitters.onActivity?.({ kind: "tool-call", tool: "sample_values", label: `Sampling ${table}.${column}` });

      const schemaTable = findTable(schema, table);
      if (!schemaTable) {
        return { error: `Unknown table "${table}".`, suggestions: suggestTables(schema, table) };
      }
      const schemaColumn = schemaTable.columns.find((c) => c.name.toLowerCase() === column.trim().toLowerCase());
      if (!schemaColumn) {
        return {
          error: `Table ${schemaTable.name} has no column "${column}".`,
          availableColumns: schemaTable.columns.map((c) => c.name),
        };
      }

      const sql = buildSampleSql(schemaTable.name, schemaColumn.name, limit);
      try {
        const validation = await runtime.validateSql(sql);
        if (!validation.valid || !validation.normalizedSql) {
          throw new Error(validation.violations.join("; ") || "sampling query blocked");
        }
        const result = await runtime.executeSql(validation.normalizedSql);
        const values = result.rows.map((row) => row.value);
        state.transcript.push({
          tool: "sample_values",
          input: { table: schemaTable.name, column: schemaColumn.name },
          outcome: "ok",
          summary: `${values.length} values`,
        });
        return { table: schemaTable.name, column: schemaColumn.name, values };
      } catch (error) {
        const message = getErrorMessage(error) || "Sampling failed.";
        state.transcript.push({
          tool: "sample_values",
          input: { table: schemaTable.name, column: schemaColumn.name },
          outcome: "error",
          summary: message,
        });
        return { error: `Sampling failed: ${message}` };
      }
    },
  });
}
