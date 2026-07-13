import type { BlockView, ChartConfig as SharedChartConfig, ViewTransform } from "@query-wise/shared/types";
import type { ChartConfig, ChartType, QueryResult } from "@/types";
import { bucketTopN, detectSeriesKey, pivotSeries } from "./pivot";
import { inferColumnProfile } from "./profiles";
import { toCumulative, toPercentOfTotal } from "./transforms";
import { computeResultViewOptions } from "./options";

/**
 * SPEC-09 §1/§2.2 — the dataset→views layer.
 *
 * A `BlockView` is a deterministic, client-side arrangement of a block's single
 * bounded dataset (`resultPreview`). Views are specs, not materialized data: the
 * transformed rows are recomputed on every render from the same rows, so provenance
 * (one visual ⇒ one SQL statement) and the 500-row cap are untouched.
 *
 * `applyViewTransform` is the one pure, total entry point. It is deterministic and
 * never throws — an invalid transform for the data shape returns the raw result
 * (and the UI hides the corresponding chip), which is why the tests assert graceful
 * degradation on empty rows, single rows, nulls, and non-numeric measures.
 */

/** Widen the shared ChartConfig to the web ChartConfig used by chart internals. */
function toWebConfig(config: SharedChartConfig, availableTypes: ChartType[] = []): ChartConfig {
  return { ...config, availableTypes };
}

function firstNumericColumn(result: QueryResult): string | undefined {
  return result.columns.find((column) => inferColumnProfile(result.rows, column).kind === "numeric");
}

/** The dimension (name/x) key a transform should group by, given the view's config. */
function dimensionKey(config: SharedChartConfig, result: QueryResult): string | undefined {
  return config.nameKey ?? config.xKey ?? result.columns[0];
}

/**
 * Apply a view's transform to a block's dataset. Pure and total: returns the raw
 * result unchanged when the transform cannot apply to this shape.
 */
export function applyViewTransform(result: QueryResult, view: BlockView): QueryResult {
  const transform = view.transform;
  if (!transform) return result;
  if (result.rows.length === 0) return result;
  const config = view.chartConfig;
  try {
    switch (transform.kind) {
      case "topN": {
        const nameKey = dimensionKey(config, result);
        const valueKey =
          transform.measureKey || config.valueKey || config.yKey || firstNumericColumn(result);
        if (!nameKey || !valueKey || !result.columns.includes(valueKey)) return result;
        const n = Math.max(1, Math.floor(transform.n));
        if (result.rows.length <= n) return result;
        if (transform.othersBucket) {
          // bucketTopN keeps (max-1) rows plus one aggregated "Other"; max=n+1 ⇒ top-n + Other.
          return bucketTopN(result, { nameKey, valueKey, max: n + 1 });
        }
        const sorted = [...result.rows].sort(
          (a, b) => (Number(b[valueKey]) || 0) - (Number(a[valueKey]) || 0),
        );
        const rows = sorted.slice(0, n);
        return { ...result, rows, rowCount: rows.length };
      }
      case "cumulative": {
        const measureKeys = transform.measureKeys.filter((key) => result.columns.includes(key));
        if (measureKeys.length === 0) return result;
        return toCumulative(result, measureKeys, config.xKey ?? dimensionKey(config, result));
      }
      case "percentOfTotal": {
        const measureKeys = transform.measureKeys.filter((key) => result.columns.includes(key));
        if (measureKeys.length === 0) return result;
        return toPercentOfTotal(result, measureKeys);
      }
      case "pivot": {
        const xKey = config.xKey ?? result.columns[0];
        const measureKey = config.yKey ?? config.valueKey ?? firstNumericColumn(result);
        if (!xKey || !measureKey || !result.columns.includes(transform.seriesKey)) return result;
        if (!result.columns.includes(measureKey)) return result;
        return pivotSeries(result, { xKey, measureKey, seriesKey: transform.seriesKey }).result;
      }
      default:
        return result;
    }
  } catch {
    return result;
  }
}

/**
 * The chart config to draw a transformed result with. Identical to the view's
 * config except for `pivot`, where the long series column is gone and the wide
 * series columns (recomputed from the transformed data, so it survives live
 * refreshes with different top-N series) become the measures.
 */
export function viewChartConfig(view: BlockView, transformed: QueryResult): SharedChartConfig {
  if (view.transform?.kind !== "pivot") return view.chartConfig;
  const xKey = view.chartConfig.xKey ?? transformed.columns[0];
  const yKeys = transformed.columns.filter((column) => column !== xKey);
  return { ...view.chartConfig, xKey, yKeys, seriesKey: undefined };
}

/** Resolve a view to the concrete `{ result, config }` a chart consumes. DRY across
 *  the card, pinned widgets, and public shares. */
export function resolveView(
  result: QueryResult,
  view: BlockView,
): { result: QueryResult; config: SharedChartConfig } {
  const transformed = applyViewTransform(result, view);
  return { result: transformed, config: viewChartConfig(view, transformed) };
}

export interface TransformOption {
  transform: ViewTransform;
  label: string;
  /** A sensible default chart type for this arrangement. */
  chartType: ChartType;
}

/**
 * Shape-gated transform menu (SPEC-09 §2.1, §3 AC3). Only transforms that make
 * sense for this data are offered — cumulative needs a time x-axis, pivot needs a
 * detectable low-cardinality series key, % of total needs multiple measures. A
 * single-row (KPI) result offers nothing. Invalid options are never shown (never
 * disabled-and-confusing).
 */
export function availableTransforms(result: QueryResult, baseConfig: SharedChartConfig | null): TransformOption[] {
  if (result.rows.length <= 1) return [];
  const options = computeResultViewOptions(result);
  const profiles = result.columns.map((column) => ({ column, profile: inferColumnProfile(result.rows, column) }));
  const measures = profiles.filter(({ profile }) => profile.kind === "numeric" && !profile.likelyId).map((p) => p.column);
  const dateDim = profiles.find(({ profile }) => profile.kind === "date")?.column;
  const dimension = profiles.find(({ profile }) => profile.kind === "date" || profile.kind === "text")?.column;
  const primaryMeasure = baseConfig?.yKey ?? baseConfig?.valueKey ?? measures[0];
  const out: TransformOption[] = [];

  // Top N: a categorical/temporal dimension ranked by a measure, with more rows
  // than the cut — bars or a pie.
  if (dimension && primaryMeasure && result.rows.length > 3) {
    const n = Math.min(10, result.rows.length - 1);
    out.push({
      transform: { kind: "topN", n, measureKey: primaryMeasure, othersBucket: true },
      label: `Top ${n}`,
      chartType: options.chartTypes.includes("bar") ? "bar" : options.chartTypes[0] ?? "bar",
    });
  }

  // Cumulative: only over a time x-axis (running totals across a date dimension).
  if (dateDim && primaryMeasure) {
    out.push({
      transform: { kind: "cumulative", measureKeys: measures.length ? measures : [primaryMeasure] },
      label: "Cumulative",
      chartType: options.chartTypes.includes("area") ? "area" : options.chartTypes.includes("line") ? "line" : "line",
    });
  }

  // % of total: composition across ≥2 measures (or a detectable multi-series key).
  const seriesKey = baseConfig
    ? detectSeriesKey(result, toWebConfig(baseConfig, options.chartTypes))
    : undefined;
  if (measures.length >= 2 || seriesKey) {
    const measureKeys = measures.length >= 2 ? measures : [primaryMeasure!].filter(Boolean);
    if (measureKeys.length) {
      out.push({
        transform: { kind: "percentOfTotal", measureKeys },
        label: "% of total",
        chartType: options.chartTypes.includes("area") ? "area" : options.chartTypes[0] ?? "bar",
      });
    }
  }

  // Pivot: a low-cardinality (≤12) non-id series column with repeated x values.
  if (seriesKey) {
    out.push({
      transform: { kind: "pivot", seriesKey },
      label: `Pivot by ${seriesKey.replaceAll("_", " ")}`,
      chartType: options.chartTypes.includes("line") ? "line" : options.chartTypes[0] ?? "bar",
    });
  }

  return out;
}
