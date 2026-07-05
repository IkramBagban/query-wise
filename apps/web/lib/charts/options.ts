import type { ChartType, QueryResult } from "@/types";
import { detectChartConfig } from "./detect";
import { inferColumnProfile } from "./profiles";

const RENDERABLE_CHART_TYPES: ChartType[] = ["bar", "line", "area", "pie", "scatter"];

export interface ResultViewOptions {
  /** Chart types that are semantically valid for this data (never all-of-them). */
  chartTypes: ChartType[];
  /** Best default chart type, or null when no chart fits. */
  defaultChartType: ChartType | null;
  /** Single-row result → render as KPI stat cards instead of a chart. */
  isSingleRow: boolean;
  /** Whether the single row has at least one numeric column worth showing big. */
  hasNumericColumn: boolean;
}

/**
 * Derives what views a result should offer — computed from the data itself, so
 * the type switcher only ever exposes charts that make sense (no pie for a
 * time series, no scatter for a categorical top-N). This is the single source
 * of truth the UI consults instead of hardcoding all six types everywhere.
 */
export function computeResultViewOptions(result: QueryResult): ResultViewOptions {
  const detected = detectChartConfig(result);
  const chartTypes = detected.availableTypes.filter((type): type is ChartType =>
    RENDERABLE_CHART_TYPES.includes(type),
  );
  const defaultChartType = detected.type !== "table" ? detected.type : chartTypes[0] ?? null;
  const isSingleRow = result.rows.length === 1;
  const hasNumericColumn = result.columns.some(
    (column) => inferColumnProfile(result.rows, column).kind === "numeric",
  );
  return { chartTypes, defaultChartType, isSingleRow, hasNumericColumn };
}
