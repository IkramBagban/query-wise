"use client";

import {
  CartesianGrid,
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
}

export function ScatterChartView({ result, xKey, yKey }: ScatterChartViewProps) {
  return (
    <ResponsiveContainer width="100%" height={320}>
      <ScatterChart>
        <CartesianGrid stroke="var(--border)" />
        <XAxis dataKey={xKey} stroke="var(--text-3)" tick={{ fontSize: 12 }} />
        <YAxis dataKey={yKey} stroke="var(--text-3)" tick={{ fontSize: 12 }} />
        <Tooltip contentStyle={{ background: "#ffffff", border: "1px solid var(--border)", borderRadius: 8 }} />
        <Scatter data={result.rows} fill="#2ed52e" />
      </ScatterChart>
    </ResponsiveContainer>
  );
}


