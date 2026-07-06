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
import { labelize } from "@/lib/charts/format";
import { formatCompactAs, formatFullAs, PLAIN_NUMBER, type ColumnFormat } from "@/lib/charts/semantics";

interface ScatterChartViewProps {
  result: QueryResult;
  xKey: string;
  yKey: string;
  yKeys?: string[];
  valueFormat?: ColumnFormat;
  xFormat?: ColumnFormat;
  skipEntrance?: boolean;
}

const SCATTER_COLORS = ["#2ed52e", "#f59e0b", "#ef4444", "#8b5cf6", "#14b8a6", "#84cc16"];

export function ScatterChartView({ result, xKey, yKey, yKeys, valueFormat = PLAIN_NUMBER, xFormat = PLAIN_NUMBER, skipEntrance }: ScatterChartViewProps) {
  const series = (yKeys && yKeys.length > 0 ? yKeys : [yKey]).filter(Boolean);
  const pointsBySeries = series.map((seriesKey) =>
    result.rows.map((row) => ({ x: row[xKey], y: row[seriesKey] })),
  );
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ScatterChart margin={{ top: 8, right: 12, left: 12, bottom: 24 }}>
        <CartesianGrid stroke="var(--border)" />
        <XAxis
          dataKey="x"
          type="number"
          name={labelize(xKey)}
          stroke="var(--faint)"
          tick={{ fontSize: 12 }}
          tickFormatter={(value) => formatCompactAs(value, xFormat)}
          label={{ value: labelize(xKey), position: "insideBottom", offset: -12, fill: "var(--faint)", fontSize: 11 }}
        />
        <YAxis
          dataKey="y"
          type="number"
          name={labelize(yKey)}
          stroke="var(--faint)"
          tick={{ fontSize: 12 }}
          tickFormatter={(value) => formatCompactAs(value, valueFormat)}
          width={52}
        />
        <Tooltip
          cursor={{ strokeDasharray: "3 3" }}
          contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text)" }}
          formatter={(value, name) => [
            name === "x" ? formatFullAs(value, xFormat) : formatFullAs(value, valueFormat),
            name === "x" ? labelize(xKey) : name === "y" ? labelize(yKey) : labelize(String(name)),
          ]}
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
            isAnimationActive={!skipEntrance}
            animationDuration={650}
            animationEasing="ease-out"
          />
        ))}
      </ScatterChart>
    </ResponsiveContainer>
  );
}


