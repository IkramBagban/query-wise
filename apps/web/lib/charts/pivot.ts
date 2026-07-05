import type { ChartConfig, QueryResult } from "@/types";
import { inferColumnProfile } from "./profiles";

const MAX_SERIES = 8;

/**
 * Detects "long/tidy" data that should be pivoted into multiple chart series.
 *
 * A result like (month, category_name, revenue) has one row per month PER
 * category, so plotting revenue against month as a single line zig-zags between
 * categories (the "sawtooth" bug). When there is a dimension x, a single numeric
 * measure, and a low-cardinality category column with repeated x values, that
 * category column is the series key — each of its values becomes its own line.
 */
export function detectSeriesKey(result: QueryResult, config: ChartConfig): string | undefined {
  if (config.type !== "line" && config.type !== "area" && config.type !== "bar") return undefined;
  const measure = config.yKey;
  const xKey = config.xKey;
  if (!measure || !xKey) return undefined;
  // Only single-measure results pivot; multi-measure is already wide.
  if (config.yKeys && config.yKeys.length > 1) return undefined;

  const candidates = result.columns.filter((column) => column !== xKey && column !== measure);
  for (const column of candidates) {
    const profile = inferColumnProfile(result.rows, column);
    if (profile.kind !== "text" || profile.likelyId) continue;
    if (profile.distinctCount < 2 || profile.distinctCount > MAX_SERIES) continue;
    // Repeated x values (more rows than distinct x) confirm long format.
    const distinctX = new Set(result.rows.map((row) => String(row[xKey]))).size;
    if (distinctX < result.rows.length) return column;
  }
  return undefined;
}

export interface PivotedResult {
  result: QueryResult;
  seriesKeys: string[];
}

/**
 * Reshapes long-format rows into wide format: one column per distinct series
 * value, filled with the measure. Missing (x, series) cells become 0 so lines
 * stay continuous. Rows are ordered by x.
 */
export function pivotSeries(
  result: QueryResult,
  opts: { xKey: string; measureKey: string; seriesKey: string },
): PivotedResult {
  const { xKey, measureKey, seriesKey } = opts;
  const seriesKeys = [...new Set(result.rows.map((row) => String(row[seriesKey] ?? "")))]
    .filter((value) => value !== "")
    .slice(0, MAX_SERIES);

  const byX = new Map<string, Record<string, unknown>>();
  const xOrder: string[] = [];
  for (const row of result.rows) {
    const rawX = row[xKey];
    const key = rawX instanceof Date ? rawX.toISOString() : String(rawX);
    if (!byX.has(key)) {
      byX.set(key, { [xKey]: rawX });
      xOrder.push(key);
    }
    const series = String(row[seriesKey] ?? "");
    if (seriesKeys.includes(series)) {
      const numeric = Number(row[measureKey]);
      byX.get(key)![series] = Number.isFinite(numeric) ? numeric : 0;
    }
  }

  const rows = xOrder
    .map((key) => {
      const bucket = byX.get(key)!;
      for (const series of seriesKeys) if (bucket[series] == null) bucket[series] = 0;
      return bucket;
    })
    .sort((a, b) => {
      const av = a[xKey];
      const bv = b[xKey];
      const at = av instanceof Date ? av.getTime() : Date.parse(String(av));
      const bt = bv instanceof Date ? bv.getTime() : Date.parse(String(bv));
      if (Number.isFinite(at) && Number.isFinite(bt)) return at - bt;
      return String(av).localeCompare(String(bv));
    });

  return {
    result: { columns: [xKey, ...seriesKeys], rows, rowCount: rows.length, executionTimeMs: result.executionTimeMs },
    seriesKeys,
  };
}
