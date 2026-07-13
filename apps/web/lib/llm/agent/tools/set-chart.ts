import { tool } from "ai";
import { z } from "zod";
import type { BoundedQueryResult, ResultColumn } from "@query-wise/shared/types";
import { resolveChartConfig } from "@/lib/charts";
import type { ChartHint, ChartType } from "@/types";
import type { AgentRunState, AnalystAgentEmitters } from "../types";

type ColumnKind = "numeric" | "temporal" | "categorical";

const CHART_TYPES = ["bar", "line", "pie", "scatter", "area", "table"] as const;
const PIE_MAX_SLICES = 12;

function columnKind(column: ResultColumn, rows: BoundedQueryResult["rows"]): ColumnKind {
  switch (column.canonicalType) {
    case "integer":
    case "decimal":
      return "numeric";
    case "date":
    case "time":
    case "datetime":
      return "temporal";
    case "unknown": {
      const sample = rows.map((row) => row[column.name]).find((value) => value != null);
      return typeof sample === "number" ? "numeric" : "categorical";
    }
    default:
      return "categorical";
  }
}

/**
 * Axis-semantics validation (arch §3.2): measures must be numeric, dimensions
 * categorical/temporal. Rejections name every column and its kind so the
 * agent can correct the config instead of guessing.
 */
export function validateChartHint(
  hint: { type: ChartType } & ChartHint,
  result: BoundedQueryResult,
): string[] {
  const kinds = new Map(result.columns.map((column) => [column.name, columnKind(column, result.rows)]));
  const errors: string[] = [];
  const requireKey = (label: string, key: string | undefined, allowed: ColumnKind[]) => {
    if (!key) {
      errors.push(`${label} is required for ${hint.type} charts.`);
      return;
    }
    const kind = kinds.get(key);
    if (!kind) errors.push(`${label} "${key}" is not a result column.`);
    else if (!allowed.includes(kind)) errors.push(`${label} "${key}" is ${kind}; expected ${allowed.join(" or ")}.`);
  };

  if (hint.type === "table") return [];
  if (hint.type === "pie") {
    requireKey("nameKey", hint.nameKey, ["categorical", "temporal"]);
    requireKey("valueKey", hint.valueKey, ["numeric"]);
    if (result.returnedRowCount > PIE_MAX_SLICES) {
      errors.push(`Pie needs low cardinality; result has ${result.returnedRowCount} rows (max ${PIE_MAX_SLICES}).`);
    }
    return errors;
  }

  const measures = [hint.yKey, ...(hint.yKeys ?? [])].filter((key): key is string => Boolean(key));
  if (measures.length === 0) errors.push(`yKey (or yKeys) is required for ${hint.type} charts.`);
  for (const key of measures) requireKey("yKey", key, ["numeric"]);
  requireKey("xKey", hint.xKey, hint.type === "scatter" ? ["numeric", "temporal"] : ["categorical", "temporal"]);
  return errors;
}

export function createSetChartTool(deps: { state: AgentRunState; emitters: AnalystAgentEmitters }) {
  const { state, emitters } = deps;
  return tool({
    description:
      "Choose the chart for a result block's default view. Measures (numeric) go on yKey/yKeys/valueKey; the dimension " +
      "(categorical or time) goes on xKey/nameKey. Omit blockIndex to target the latest block. " +
      "The user can add alternate views (top-N, cumulative, % of total, pivot) themselves; do not run new SQL merely to re-arrange data already returned.",
    inputSchema: z.object({
      blockIndex: z.number().int().min(0).optional(),
      type: z.enum(CHART_TYPES),
      xKey: z.string().trim().optional(),
      yKey: z.string().trim().optional(),
      yKeys: z.array(z.string().trim().min(1)).optional(),
      nameKey: z.string().trim().optional(),
      valueKey: z.string().trim().optional(),
      title: z.string().trim().max(120).optional(),
    }),
    execute: async ({ blockIndex, title, ...hint }) => {
      const block = state.blocks[blockIndex ?? state.blocks.length - 1];
      if (!block) return { error: "No result block exists yet. Run a query first." };

      const errors = validateChartHint(hint, block.result);
      if (errors.length > 0) {
        // set_chart is an internal, user-hidden tool — keep it out of the
        // persisted transcript so the finalized timeline stays clean.
        return {
          error: errors.join(" "),
          columns: block.result.columns.map((column) => ({
            name: column.name,
            kind: columnKind(column, block.result.rows),
          })),
        };
      }

      block.chartHint = hint;
      // Resolve immediately so the refined chart streams to the UI now instead
      // of waiting for the whole agent run to finish.
      const resolved = resolveChartConfig(
        {
          columns: block.result.columns.map((column) => column.name),
          rows: block.result.rows,
          rowCount: block.result.returnedRowCount,
          executionTimeMs: block.result.executionTimeMs,
        },
        hint,
      );
      block.chartConfig = title ? { ...resolved, title } : resolved;
      emitters.onChartConfig?.({ blockIndex: block.index, chartConfig: block.chartConfig });
      emitters.onActivity?.({
        kind: "tool-result",
        tool: "set_chart",
        blockIndex: block.index,
        label: `Chart: ${hint.type}${title ? ` — ${title}` : ""}`,
      });
      return { ok: true, blockIndex: block.index };
    },
  });
}
