"use client";

import { AreaChartView } from "@/components/charts/AreaChartView";
import { BarChartView } from "@/components/charts/BarChartView";
import { LineChartView } from "@/components/charts/LineChartView";
import { PieChartView } from "@/components/charts/PieChartView";
import { ScatterChartView } from "@/components/charts/ScatterChartView";
import { TableView } from "@/components/charts/TableView";
import type { ChartConfig, QueryResult } from "@/types";

interface ChartRendererProps {
  result: QueryResult;
  chartConfig: ChartConfig;
}

export function ChartRenderer({ result, chartConfig }: ChartRendererProps) {
  const fallbackX = chartConfig.xKey ?? result.columns[0];
  const fallbackY = chartConfig.yKey ?? result.columns[1] ?? result.columns[0];
  const fallbackYs =
    chartConfig.yKeys && chartConfig.yKeys.length > 0
      ? chartConfig.yKeys
      : [fallbackY];

  switch (chartConfig.type) {
    case "bar":
      return (
        <BarChartView
          result={result}
          xKey={fallbackX}
          yKey={fallbackY}
          yKeys={chartConfig.yKeys}
        />
      );
    case "line":
      return (
        <LineChartView
          result={result}
          xKey={fallbackX}
          yKey={fallbackY}
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
          yKeys={fallbackYs}
        />
      );
    case "area":
      return (
        <AreaChartView
          result={result}
          xKey={fallbackX}
          yKey={fallbackY}
          yKeys={fallbackYs}
        />
      );
    case "table":
      return <TableView result={result} />;
    default:
      return <TableView result={result} />;
  }
}

