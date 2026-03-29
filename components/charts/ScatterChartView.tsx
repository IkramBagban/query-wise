"use client";

import {
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { QueryResult } from "@/types";

interface ScatterChartViewProps {
  result: QueryResult;
  xKey: string;
  yKey: string;
  yKeys?: string[];
}

const SCATTER_COLORS = ["#2ed52e", "#f59e0b", "#ef4444", "#8b5cf6", "#14b8a6", "#84cc16"];
const labelize = (value: string) => value.replace(/_/g, " ");

export function ScatterChartView({ result, xKey, yKey, yKeys }: ScatterChartViewProps) {
  const series = (yKeys && yKeys.length > 0 ? yKeys : [yKey]).filter(Boolean);
  const pointsBySeries = series.map((seriesKey) =>
    result.rows.map((row) => ({ x: row[xKey], y: row[seriesKey] })),
  );
  return (
    <ResponsiveContainer width="100%" height={320}>
      <ScatterChart>
        <CartesianGrid stroke="var(--border)" />
        <XAxis dataKey="x" stroke="var(--text-3)" tick={{ fontSize: 12 }} />
        <YAxis dataKey="y" stroke="var(--text-3)" tick={{ fontSize: 12 }} />
        <Tooltip
          contentStyle={{ background: "#ffffff", border: "1px solid var(--border)", borderRadius: 8 }}
          formatter={(value, name) => [value, labelize(String(name))]}
        />
        {series.length > 1 ? (
          <Legend wrapperStyle={{ fontSize: 12 }} formatter={(value) => labelize(String(value))} />
        ) : null}
        {series.map((seriesKey, index) => (
          <Scatter
            key={seriesKey}
            name={labelize(seriesKey)}
            data={pointsBySeries[index]}
            fill={SCATTER_COLORS[index % SCATTER_COLORS.length]}
          />
        ))}
      </ScatterChart>
    </ResponsiveContainer>
  );
}


