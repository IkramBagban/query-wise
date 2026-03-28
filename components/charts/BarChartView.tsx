"use client";

import {
  CartesianGrid,
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
}

export function BarChartView({ result, xKey, yKey }: BarChartViewProps) {
  return (
    <ResponsiveContainer width="100%" height={320}>
      <BarChart data={result.rows}>
        <defs>
          <linearGradient id="barGreenGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#4bea4b" />
            <stop offset="100%" stopColor="#2ed52e" />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
        <XAxis dataKey={xKey} stroke="var(--text-3)" tick={{ fontSize: 12 }} />
        <YAxis stroke="var(--text-3)" tick={{ fontSize: 12 }} />
        <Tooltip contentStyle={{ background: "#ffffff", border: "1px solid var(--border)", borderRadius: 8, color: "#000000" }} />
        <Bar dataKey={yKey} fill="url(#barGreenGradient)" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

