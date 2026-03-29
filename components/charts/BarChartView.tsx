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

export function BarChartView({ result, xKey, yKey, yKeys }: BarChartViewProps) {
  const series = (yKeys && yKeys.length > 0 ? yKeys : [yKey]).filter(Boolean);
  const shouldRotateTicks = result.rows.length > 6;

  return (
    <ResponsiveContainer width="100%" height={320}>
      <BarChart data={result.rows}>
        <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
        <XAxis
          dataKey={xKey}
          stroke="var(--text-3)"
          tick={{ fontSize: 12 }}
          interval={0}
          angle={shouldRotateTicks ? -35 : 0}
          textAnchor={shouldRotateTicks ? "end" : "middle"}
          height={shouldRotateTicks ? 70 : 35}
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

