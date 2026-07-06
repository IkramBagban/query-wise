"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { QueryResult } from "@/types";
import { formatAxisTick, formatValue, isDateLikeValue, labelize } from "@/lib/charts/format";
import { formatCompactAs, formatFullAs, PLAIN_NUMBER, type ColumnFormat } from "@/lib/charts/semantics";
import { secondaryAxisSeries, toPercentOfTotal } from "@/lib/charts/transforms";
import type { BarStackMode } from "./BarChartView";

interface AreaChartViewProps {
  result: QueryResult;
  xKey: string;
  yKey: string;
  yKeys?: string[];
  valueFormat?: ColumnFormat;
  stack?: BarStackMode;
  skipEntrance?: boolean;
}

const AREA_STROKES = ["#2ed52e", "#f59e0b", "#ef4444", "#8b5cf6", "#14b8a6", "#84cc16"];
const AREA_FILLS = [
  "rgba(46,213,46,0.28)",
  "rgba(245,158,11,0.22)",
  "rgba(239,68,68,0.2)",
  "rgba(139,92,246,0.2)",
  "rgba(20,184,166,0.2)",
  "rgba(132,204,22,0.2)",
];

export function AreaChartView({ result, xKey, yKey, yKeys, valueFormat = PLAIN_NUMBER, stack = "none", skipEntrance }: AreaChartViewProps) {
  const series = (yKeys && yKeys.length > 0 ? yKeys : [yKey]).filter(Boolean);
  const isPercent = stack === "percent" && series.length > 1;
  const stackId = stack !== "none" && series.length > 1 ? "stack" : undefined;
  const data = isPercent ? toPercentOfTotal(result, series).rows : result.rows;
  const sampleLabel = result.rows[0]?.[xKey];
  const isDateLikeAxis = isDateLikeValue(sampleLabel);
  const hasLongLabels = result.rows.some((row) => String(row[xKey] ?? "").length > 10);
  const isVeryDenseAxis = result.rows.length > 20;
  const shouldRotateTicks = result.rows.length > 8 || (!isDateLikeAxis && hasLongLabels);
  const tickInterval: number | "preserveStartEnd" = isVeryDenseAxis ? "preserveStartEnd" : 0;
  // Stacking and a secondary axis are mutually exclusive (stacking needs a
  // shared axis). Stacking wins when requested.
  const secondaryKey = stackId ? null : secondaryAxisSeries(result.rows, series);
  const measureTick = (value: unknown) => (isPercent ? `${Math.round(Number(value))}%` : formatCompactAs(value, valueFormat));
  const measureFull = (value: unknown) => (isPercent ? `${Number(value).toFixed(1)}%` : formatFullAs(value, valueFormat));
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart
        data={data}
        margin={{ top: 8, right: 10, left: 6, bottom: shouldRotateTicks ? 52 : 16 }}
      >
        <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
        <XAxis
          dataKey={xKey}
          stroke="var(--faint)"
          tick={{ fontSize: 11 }}
          tickFormatter={formatAxisTick}
          interval={tickInterval}
          angle={shouldRotateTicks ? -35 : 0}
          textAnchor={shouldRotateTicks ? "end" : "middle"}
          tickMargin={shouldRotateTicks ? 10 : 6}
          height={shouldRotateTicks ? 56 : 26}
          minTickGap={18}
        />
        <YAxis yAxisId="left" stroke="var(--faint)" tick={{ fontSize: 12 }} tickFormatter={measureTick} width={52} domain={isPercent ? [0, 100] : undefined} />
        {secondaryKey ? (
          <YAxis yAxisId="right" orientation="right" stroke="var(--faint)" tick={{ fontSize: 12 }} tickFormatter={measureTick} width={52} />
        ) : null}
        <Tooltip
          contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text)" }}
          labelFormatter={(label) => formatValue(label)}
          formatter={(value, name) => [measureFull(value), labelize(String(name))]}
        />
        {series.length > 1 ? (
          <Legend wrapperStyle={{ fontSize: 12 }} formatter={(value) => labelize(String(value))} />
        ) : null}
        {series.map((seriesKey, index) => (
          <Area
            key={seriesKey}
            yAxisId={secondaryKey === seriesKey ? "right" : "left"}
            stackId={stackId}
            type="monotone"
            dataKey={seriesKey}
            name={labelize(seriesKey)}
            stroke={AREA_STROKES[index % AREA_STROKES.length]}
            fill={AREA_FILLS[index % AREA_FILLS.length]}
            isAnimationActive={!skipEntrance}
            animationDuration={650}
            animationEasing="ease-out"
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}


