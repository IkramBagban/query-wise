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
import { abbreviateNumber, formatAxisTick, formatValue, isDateLikeValue, labelize } from "@/lib/charts/format";

interface AreaChartViewProps {
  result: QueryResult;
  xKey: string;
  yKey: string;
  yKeys?: string[];
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

export function AreaChartView({ result, xKey, yKey, yKeys }: AreaChartViewProps) {
  const series = (yKeys && yKeys.length > 0 ? yKeys : [yKey]).filter(Boolean);
  const sampleLabel = result.rows[0]?.[xKey];
  const isDateLikeAxis = isDateLikeValue(sampleLabel);
  const hasLongLabels = result.rows.some((row) => String(row[xKey] ?? "").length > 10);
  const isVeryDenseAxis = result.rows.length > 20;
  const shouldRotateTicks = result.rows.length > 8 || (!isDateLikeAxis && hasLongLabels);
  const tickInterval: number | "preserveStartEnd" = isVeryDenseAxis ? "preserveStartEnd" : 0;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart
        data={result.rows}
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
        <YAxis stroke="var(--faint)" tick={{ fontSize: 12 }} tickFormatter={(value) => abbreviateNumber(Number(value))} width={52} />
        <Tooltip
          contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text)" }}
          labelFormatter={(label) => formatValue(label)}
          formatter={(value, name) => [formatValue(value), labelize(String(name))]}
        />
        {series.length > 1 ? (
          <Legend wrapperStyle={{ fontSize: 12 }} formatter={(value) => labelize(String(value))} />
        ) : null}
        {series.map((seriesKey, index) => (
          <Area
            key={seriesKey}
            type="monotone"
            dataKey={seriesKey}
            name={labelize(seriesKey)}
            stroke={AREA_STROKES[index % AREA_STROKES.length]}
            fill={AREA_FILLS[index % AREA_FILLS.length]}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}


