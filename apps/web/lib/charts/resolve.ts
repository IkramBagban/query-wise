import type { ChartConfig, ChartHint, QueryResult } from "@/types";

import { withYKeys } from "./config";
import { detectChartConfig } from "./detect";
import { applyChartHint } from "./hints";
import { detectSeriesKey } from "./pivot";

export function resolveChartConfig(
  result: QueryResult,
  hint?: ChartHint | null,
): ChartConfig {
  const base = detectChartConfig(result);
  const resolved = applyChartHint(base, result, hint);

  const withFallbackType = resolved.availableTypes.includes(resolved.type)
    ? resolved
    : {
        ...resolved,
        availableTypes: [resolved.type, ...resolved.availableTypes],
      };

  const withSeries = withYKeys(withFallbackType);
  // Detect long-format data (one row per x per category) and mark the category
  // column as the series key so the renderer draws one line per category
  // instead of a single zig-zagging line.
  const seriesKey = detectSeriesKey(result, withSeries);
  return seriesKey ? { ...withSeries, seriesKey } : withSeries;
}
