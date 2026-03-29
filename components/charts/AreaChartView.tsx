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
const labelize = (value: string) => value.replace(/_/g, " ");

export function AreaChartView({ result, xKey, yKey, yKeys }: AreaChartViewProps) {
  const series = (yKeys && yKeys.length > 0 ? yKeys : [yKey]).filter(Boolean);
  return (
    <ResponsiveContainer width="100%" height={320}>
      <AreaChart data={result.rows}>
        <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
        <XAxis dataKey={xKey} stroke="var(--text-3)" tick={{ fontSize: 12 }} />
        <YAxis stroke="var(--text-3)" tick={{ fontSize: 12 }} />
        <Tooltip
          contentStyle={{ background: "#ffffff", border: "1px solid var(--border)", borderRadius: 8 }}
          formatter={(value, name) => [value, labelize(String(name))]}
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


