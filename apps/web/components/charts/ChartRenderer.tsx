"use client";

import { AreaChartView } from "@/components/charts/AreaChartView";
import { BarChartView } from "@/components/charts/BarChartView";
import { LineChartView } from "@/components/charts/LineChartView";
import { PieChartView } from "@/components/charts/PieChartView";
import { ScatterChartView } from "@/components/charts/ScatterChartView";
import { TableView } from "@/components/charts/TableView";
import { bucketTopN, pivotSeries } from "@/lib/charts/pivot";
import { inferColumnFormat, PLAIN_NUMBER } from "@/lib/charts/semantics";
import { hardenTimeAxis, indexToHundred } from "@/lib/charts/transforms";
import type { BarStackMode } from "./BarChartView";
import type { ChartConfig, QueryResult } from "@/types";

interface ChartRendererProps {
  result: QueryResult;
  chartConfig: ChartConfig;
  /** Index every series to 100 (relative growth) for mixed-scale comparisons. */
  normalize?: boolean;
  /** Grouped (none), stacked, or 100%-stacked for multi-series bar/area. */
  stackMode?: BarStackMode;
  skipEntrance?: boolean;
}

export function ChartRenderer({ result: rawResult, chartConfig, normalize, stackMode = "none", skipEntrance }: ChartRendererProps) {
  const fallbackX = chartConfig.xKey ?? rawResult.columns[0];
  const fallbackY = chartConfig.yKey ?? rawResult.columns[1] ?? rawResult.columns[0];

  // Snap timezone-truncated date buckets on time-series charts so labels read
  // as clean calendar dates. Non-time axes pass through unchanged.
  const isTimeAxisChart =
    chartConfig.type === "line" || chartConfig.type === "area" || chartConfig.type === "bar";
  const result = isTimeAxisChart ? hardenTimeAxis(rawResult, fallbackX) : rawResult;

  // Unit-aware formatting is inferred from the ORIGINAL columns (before any
  // pivot renames them to series values). The measure keeps its meaning across
  // all pivoted series, so one measure format applies to the whole Y axis.
  const measureName = chartConfig.valueKey ?? fallbackY;
  const xFormat = inferColumnFormat(fallbackX, result.rows);

  // Long-format results (one row per x per category) are pivoted into one series
  // per category so multi-series charts draw clean lines instead of a sawtooth.
  const seriesPivot =
    chartConfig.seriesKey &&
    (chartConfig.type === "line" || chartConfig.type === "area" || chartConfig.type === "bar")
      ? pivotSeries(result, { xKey: fallbackX, measureKey: fallbackY, seriesKey: chartConfig.seriesKey })
      : null;
  const pivotedResult = seriesPivot?.result ?? result;
  const chartX = fallbackX;
  const fallbackYs = seriesPivot
    ? seriesPivot.seriesKeys
    : chartConfig.yKeys && chartConfig.yKeys.length > 0
      ? chartConfig.yKeys
      : [fallbackY];
  const chartY = fallbackYs[0] ?? fallbackY;

  // Index-to-100 only makes sense for multi-series line/area comparisons.
  const canNormalize =
    Boolean(normalize) &&
    fallbackYs.length >= 2 &&
    (chartConfig.type === "line" || chartConfig.type === "area");
  const chartResult = canNormalize ? indexToHundred(pivotedResult, fallbackYs) : pivotedResult;
  // Normalized values are an index (100 = baseline), not the original unit.
  const valueFormat = canNormalize ? PLAIN_NUMBER : inferColumnFormat(measureName, result.rows);

  switch (chartConfig.type) {
    case "bar":
      return (
        <BarChartView
          result={chartResult}
          xKey={chartX}
          yKey={chartY}
          yKeys={fallbackYs}
          valueFormat={valueFormat}
          stack={stackMode}
          skipEntrance={skipEntrance}
        />
      );
    case "line":
      return (
        <LineChartView
          result={chartResult}
          xKey={chartX}
          yKey={chartY}
          yKeys={fallbackYs}
          valueFormat={valueFormat}
          skipEntrance={skipEntrance}
        />
      );
    case "pie": {
      const nameKey = chartConfig.nameKey ?? fallbackX;
      const valueKey = chartConfig.valueKey ?? fallbackY;
      return (
        <PieChartView
          result={bucketTopN(result, { nameKey, valueKey })}
          nameKey={nameKey}
          valueKey={valueKey}
          valueFormat={inferColumnFormat(valueKey, result.rows)}
          skipEntrance={skipEntrance}
        />
      );
    }
    case "scatter":
      return (
        <ScatterChartView
          result={result}
          xKey={fallbackX}
          yKey={fallbackY}
          yKeys={chartConfig.yKeys && chartConfig.yKeys.length > 0 ? chartConfig.yKeys : [fallbackY]}
          valueFormat={valueFormat}
          xFormat={xFormat}
          skipEntrance={skipEntrance}
        />
      );
    case "area":
      return (
        <AreaChartView
          result={chartResult}
          xKey={chartX}
          yKey={chartY}
          yKeys={fallbackYs}
          valueFormat={valueFormat}
          stack={stackMode}
          skipEntrance={skipEntrance}
        />
      );
    case "table":
      return <TableView result={result} />;
    default:
      return <TableView result={result} />;
  }
}

