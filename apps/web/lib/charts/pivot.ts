import type { ChartConfig, QueryResult } from "@/types";
import { inferColumnProfile } from "./profiles";

/** Series actually drawn (top N-1 by total + one "Other"). */
const MAX_SERIES = 8;
/** Cardinality up to which a text column still qualifies as a series key; the
 *  overflow is bucketed into "Other" rather than refused (which would fall back
 *  to the sawtooth single line). */
const SERIES_DETECT_LIMIT = 12;
const OTHER_LABEL = "Other";

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
    if (profile.distinctCount < 2 || profile.distinctCount > SERIES_DETECT_LIMIT) continue;
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

  // Rank series by total measure and keep the top ones; everything past the cap
  // is summed into a single "Other" series so no data is silently dropped.
  const totals = new Map<string, number>();
  for (const row of result.rows) {
    const name = String(row[seriesKey] ?? "");
    if (!name) continue;
    totals.set(name, (totals.get(name) ?? 0) + (Number(row[measureKey]) || 0));
  }
  const ranked = [...totals.keys()].sort((a, b) => (totals.get(b) ?? 0) - (totals.get(a) ?? 0));
  const hasOverflow = ranked.length > MAX_SERIES;
  const topKeys = hasOverflow ? ranked.slice(0, MAX_SERIES - 1) : ranked;
  const topSet = new Set(topKeys);
  const seriesKeys = hasOverflow ? [...topKeys, OTHER_LABEL] : topKeys;
  const bucketOf = (name: string) => (topSet.has(name) ? name : OTHER_LABEL);

  const byX = new Map<string, Record<string, unknown>>();
  const xOrder: string[] = [];
  for (const row of result.rows) {
    const rawX = row[xKey];
    const key = rawX instanceof Date ? rawX.toISOString() : String(rawX);
    if (!byX.has(key)) {
      byX.set(key, { [xKey]: rawX });
      xOrder.push(key);
    }
    const name = String(row[seriesKey] ?? "");
    if (!name) continue;
    if (hasOverflow || topSet.has(name)) {
      const bucket = bucketOf(name);
      const numeric = Number(row[measureKey]);
      const target = byX.get(key)!;
      target[bucket] = (Number(target[bucket]) || 0) + (Number.isFinite(numeric) ? numeric : 0);
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

/**
 * Collapse a pie/category result to the top N slices plus an aggregated "Other"
 * slice, so a long tail of tiny categories doesn't clutter the chart or get
 * dropped. Returns the original result unchanged when already within the cap.
 */
export function bucketTopN(
  result: QueryResult,
  opts: { nameKey: string; valueKey: string; max?: number },
): QueryResult {
  const { nameKey, valueKey, max = MAX_SERIES } = opts;
  if (result.rows.length <= max) return result;
  const sorted = [...result.rows].sort((a, b) => (Number(b[valueKey]) || 0) - (Number(a[valueKey]) || 0));
  const top = sorted.slice(0, max - 1);
  const rest = sorted.slice(max - 1);
  const otherTotal = rest.reduce((sum, row) => sum + (Number(row[valueKey]) || 0), 0);
  const otherRow: Record<string, unknown> = { [nameKey]: OTHER_LABEL, [valueKey]: otherTotal };
  return { ...result, rows: [...top, otherRow], rowCount: top.length + 1 };
}
