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

interface BarChartViewProps {
  result: QueryResult;
  xKey: string;
  yKey: string;
  yKeys?: string[];
}

const SERIES_COLORS = ["#2ed52e", "#f59e0b", "#ef4444", "#8b5cf6", "#14b8a6", "#84cc16"];
const labelize = (value: string) => value.replace(/_/g, " ");
const isDateLikeValue = (value: unknown): boolean => {
  const text = String(value ?? "");
  return /[-/:T]/.test(text) && !Number.isNaN(Date.parse(text));
};
const shortXAxisTick = (value: unknown): string => {
  const text = String(value ?? "");
  if (isDateLikeValue(value)) {
    const date = new Date(text);
    const hasTime =
      date.getHours() !== 0 ||
      date.getMinutes() !== 0 ||
      date.getSeconds() !== 0;
    return hasTime
      ? date.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric" })
      : date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }
  return text.length > 16 ? `${text.slice(0, 16)}…` : text;
};

export function BarChartView({ result, xKey, yKey, yKeys }: BarChartViewProps) {
  const series = (yKeys && yKeys.length > 0 ? yKeys : [yKey]).filter(Boolean);
  const sampleLabel = result.rows[0]?.[xKey];
  const isDateLikeAxis = isDateLikeValue(sampleLabel);
  const hasLongLabels = result.rows.some((row) => String(row[xKey] ?? "").length > 10);
  const isVeryDenseAxis = result.rows.length > 20;
  const shouldRotateTicks = result.rows.length > 8 || (!isDateLikeAxis && hasLongLabels);
  const tickInterval: number | "preserveStartEnd" = isVeryDenseAxis ? "preserveStartEnd" : 0;

  return (
    <ResponsiveContainer width="100%" height={320}>
      <BarChart
        data={result.rows}
        margin={{ top: 8, right: 10, left: 6, bottom: shouldRotateTicks ? 52 : 16 }}
      >
        <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
        <XAxis
          dataKey={xKey}
          stroke="var(--text-3)"
          tick={{ fontSize: 11 }}
          interval={tickInterval}
          tickFormatter={shortXAxisTick}
          angle={shouldRotateTicks ? -35 : 0}
          textAnchor={shouldRotateTicks ? "end" : "middle"}
          tickMargin={shouldRotateTicks ? 10 : 6}
          height={shouldRotateTicks ? 56 : 26}
          minTickGap={18}
        />
        <YAxis stroke="var(--text-3)" tick={{ fontSize: 12 }} />
        <Tooltip
          cursor={{ fill: "rgba(46,213,46,0.08)" }}
          contentStyle={{ background: "#ffffff", border: "1px solid var(--border)", borderRadius: 8, color: "#000000" }}
          formatter={(value, name) => [value, labelize(String(name))]}
        />
        {series.length > 1 ? (
          <Legend wrapperStyle={{ fontSize: 12 }} formatter={(value) => labelize(String(value))} />
        ) : null}
        {series.map((key, index) => (
          <Bar
            key={key}
            dataKey={key}
            name={labelize(key)}
            fill={SERIES_COLORS[index % SERIES_COLORS.length]}
            radius={[4, 4, 0, 0]}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

