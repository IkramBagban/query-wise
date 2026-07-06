"use client";

import {
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  BarChart,
  Bar,
} from "recharts";

import type { QueryResult } from "@/types";
import { formatAxisTick, formatValue, isDateLikeValue, labelize } from "@/lib/charts/format";
import { formatCompactAs, formatFullAs, PLAIN_NUMBER, type ColumnFormat } from "@/lib/charts/semantics";
import { toPercentOfTotal } from "@/lib/charts/transforms";

export type BarStackMode = "none" | "stacked" | "percent";

interface BarChartViewProps {
  result: QueryResult;
  xKey: string;
  yKey: string;
  yKeys?: string[];
  valueFormat?: ColumnFormat;
  stack?: BarStackMode;
  /** Horizontal bars — better for rankings with long category labels. */
  horizontal?: boolean;
  skipEntrance?: boolean;
}

const SERIES_COLORS = ["#2ed52e", "#f59e0b", "#ef4444", "#8b5cf6", "#14b8a6", "#84cc16"];

export function BarChartView({
  result,
  xKey,
  yKey,
  yKeys,
  valueFormat = PLAIN_NUMBER,
  stack = "none",
  horizontal,
  skipEntrance,
}: BarChartViewProps) {
  const series = (yKeys && yKeys.length > 0 ? yKeys : [yKey]).filter(Boolean);
  const isPercent = stack === "percent" && series.length > 1;
  const stackId = stack !== "none" && series.length > 1 ? "stack" : undefined;
  const data = isPercent ? toPercentOfTotal(result, series).rows : result.rows;

  // Auto-horizontal for single-series rankings with long category labels: far
  // more readable than 35°-rotated ticks. Multi-series/stacked stays vertical.
  const hasLongLabels = result.rows.some((row) => String(row[xKey] ?? "").length > 12);
  const useHorizontal = horizontal ?? (series.length === 1 && !stackId && hasLongLabels && result.rows.length <= 20);

  const measureTick = (value: unknown) => (isPercent ? `${Math.round(Number(value))}%` : formatCompactAs(value, valueFormat));
  const measureFull = (value: unknown) => (isPercent ? `${Number(value).toFixed(1)}%` : formatFullAs(value, valueFormat));

  const isDateLikeAxis = isDateLikeValue(result.rows[0]?.[xKey]);
  const isVeryDenseAxis = result.rows.length > 20;
  const shouldRotateTicks = !useHorizontal && (result.rows.length > 8 || (!isDateLikeAxis && hasLongLabels));
  const tickInterval: number | "preserveStartEnd" = isVeryDenseAxis ? "preserveStartEnd" : 0;

  const categoryAxisProps = {
    dataKey: xKey,
    stroke: "var(--faint)",
    tick: { fontSize: 11 },
    tickFormatter: formatAxisTick,
  };
  const measureAxisProps = {
    stroke: "var(--faint)",
    tick: { fontSize: 12 },
    tickFormatter: measureTick,
    domain: isPercent ? ([0, 100] as [number, number]) : undefined,
  };

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart
        data={data}
        layout={useHorizontal ? "vertical" : "horizontal"}
        margin={{ top: 8, right: 12, left: useHorizontal ? 12 : 6, bottom: shouldRotateTicks ? 52 : 16 }}
      >
        <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
        {useHorizontal ? (
          <>
            <XAxis type="number" {...measureAxisProps} />
            <YAxis type="category" width={130} {...categoryAxisProps} />
          </>
        ) : (
          <>
            <XAxis
              type="category"
              {...categoryAxisProps}
              interval={tickInterval}
              angle={shouldRotateTicks ? -35 : 0}
              textAnchor={shouldRotateTicks ? "end" : "middle"}
              tickMargin={shouldRotateTicks ? 10 : 6}
              height={shouldRotateTicks ? 56 : 26}
              minTickGap={18}
            />
            <YAxis type="number" width={52} {...measureAxisProps} />
          </>
        )}
        <Tooltip
          cursor={{ fill: "rgba(46,213,46,0.08)" }}
          contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text)" }}
          labelFormatter={(label) => formatValue(label)}
          formatter={(value, name) => [measureFull(value), labelize(String(name))]}
        />
        {series.length > 1 ? (
          <Legend wrapperStyle={{ fontSize: 12 }} formatter={(value) => labelize(String(value))} />
        ) : null}
        {series.map((key, index) => (
          <Bar
            key={key}
            dataKey={key}
            name={labelize(key)}
            stackId={stackId}
            fill={SERIES_COLORS[index % SERIES_COLORS.length]}
            radius={stackId ? undefined : useHorizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]}
            isAnimationActive={!skipEntrance}
            animationDuration={650}
            animationEasing="ease-out"
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
