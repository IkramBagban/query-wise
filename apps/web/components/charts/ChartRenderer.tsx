"use client";

import { AreaChartView } from "@/components/charts/AreaChartView";
import { BarChartView } from "@/components/charts/BarChartView";
import { LineChartView } from "@/components/charts/LineChartView";
import { PieChartView } from "@/components/charts/PieChartView";
import { ScatterChartView } from "@/components/charts/ScatterChartView";
import { TableView } from "@/components/charts/TableView";
import { pivotSeries } from "@/lib/charts/pivot";
import type { ChartConfig, QueryResult } from "@/types";

interface ChartRendererProps {
  result: QueryResult;
  chartConfig: ChartConfig;
}

export function ChartRenderer({ result, chartConfig }: ChartRendererProps) {
  const fallbackX = chartConfig.xKey ?? result.columns[0];
  const fallbackY = chartConfig.yKey ?? result.columns[1] ?? result.columns[0];

  // Long-format results (one row per x per category) are pivoted into one series
  // per category so multi-series charts draw clean lines instead of a sawtooth.
  const seriesPivot =
    chartConfig.seriesKey &&
    (chartConfig.type === "line" || chartConfig.type === "area" || chartConfig.type === "bar")
      ? pivotSeries(result, { xKey: fallbackX, measureKey: fallbackY, seriesKey: chartConfig.seriesKey })
      : null;
  const chartResult = seriesPivot?.result ?? result;
  const chartX = fallbackX;
  const fallbackYs = seriesPivot
    ? seriesPivot.seriesKeys
    : chartConfig.yKeys && chartConfig.yKeys.length > 0
      ? chartConfig.yKeys
      : [fallbackY];
  const chartY = fallbackYs[0] ?? fallbackY;

  switch (chartConfig.type) {
    case "bar":
      return (
        <BarChartView
          result={chartResult}
          xKey={chartX}
          yKey={chartY}
          yKeys={fallbackYs}
        />
      );
    case "line":
      return (
        <LineChartView
          result={chartResult}
          xKey={chartX}
          yKey={chartY}
          yKeys={fallbackYs}
        />
      );
    case "pie":
      return (
        <PieChartView
          result={result}
          nameKey={chartConfig.nameKey ?? fallbackX}
          valueKey={chartConfig.valueKey ?? fallbackY}
        />
      );
    case "scatter":
      return (
        <ScatterChartView
          result={result}
          xKey={fallbackX}
          yKey={fallbackY}
          yKeys={chartConfig.yKeys && chartConfig.yKeys.length > 0 ? chartConfig.yKeys : [fallbackY]}
        />
      );
    case "area":
      return (
        <AreaChartView
          result={chartResult}
          xKey={chartX}
          yKey={chartY}
          yKeys={fallbackYs}
        />
      );
    case "table":
      return <TableView result={result} />;
    default:
      return <TableView result={result} />;
  }
}

