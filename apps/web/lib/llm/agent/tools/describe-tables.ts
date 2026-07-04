import { tool } from "ai";
import { z } from "zod";
import type { SchemaInfo, SchemaTable } from "@/types";
import { devLog } from "@query-wise/shared/observability";
import { buildStructuredTableContext } from "../../prompts";
import type { AgentRunState, AnalystAgentEmitters } from "../types";
import { findTable, suggestTables } from "./schema-lookup";

function relationshipLines(schema: SchemaInfo, tables: SchemaTable[]): string[] {
  const names = new Set(tables.map((table) => table.name));
  return schema.relationships
    .filter((r) => names.has(r.fromTable) || names.has(r.toTable))
    .map((r) => `${r.fromTable}.${r.fromColumn} -> ${r.toTable}.${r.toColumn}`);
}

export function createDescribeTablesTool(deps: {
  schema: SchemaInfo;
  state: AgentRunState;
  emitters: AnalystAgentEmitters;
}) {
  const { schema, state, emitters } = deps;
  return tool({
    description:
      "Get full column detail (names, types, keys, sample values) for specific tables from the schema snapshot. " +
      "Call this before writing SQL against tables you have not seen the columns of.",
    inputSchema: z.object({
      tables: z.array(z.string().trim().min(1)).min(1).max(8),
    }),
    execute: async ({ tables }) => {
      const start = Date.now(); // only 4 logging to see see how long this tool takes to run
      const callId = `describe_tables-${state.transcript.length}-${tables.join(",").slice(0, 40)}`;
      devLog("debug", "agent.tool.describe_tables.started", `describe_tables: ${tables.join(", ")}`, { tables });
      emitters.onActivity?.({ kind: "tool-call", tool: "describe_tables", callId, label: `Looking at ${tables.join(", ")}`, input: { tables } });
      const found: SchemaTable[] = [];
      const missing: string[] = [];
      for (const name of tables) {
        const table = findTable(schema, name);
        if (table) found.push(table);
        else missing.push(name);
      }
      const summary = `found ${found.map((t) => t.name).join(", ") || "none"}${missing.length ? `; unknown: ${missing.join(", ")}` : ""}`;
      state.transcript.push({
        tool: "describe_tables",
        input: { tables },
        outcome: missing.length === tables.length ? "error" : "ok",
        summary,
      });
      emitters.onActivity?.({
        kind: missing.length === tables.length ? "retry" : "tool-result",
        tool: "describe_tables",
        callId,
        label: summary,
      });
      devLog("debug", "agent.tool.describe_tables.completed", `describe_tables completed`, { summary, durationMs: Date.now() - start });
      if (found.length === 0) {
        return {
          error: `No matching tables for: ${missing.join(", ")}.`,
          suggestions: missing.flatMap((name) => suggestTables(schema, name)),
        };
      }
      const detail = buildStructuredTableContext({ ...schema, tables: found });
      const joins = relationshipLines(schema, found);
      return {
        detail,
        relationships: joins,
        ...(missing.length > 0
          ? { unknownTables: missing, suggestions: missing.flatMap((name) => suggestTables(schema, name)) }
          : {}),
      };
    },
  });
}
