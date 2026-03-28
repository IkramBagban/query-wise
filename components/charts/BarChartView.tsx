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

const COLORS = ["#6366f1", "#8b5cf6", "#10b981", "#f59e0b", "#ef4444", "#06b6d4"];

interface BarChartViewProps {
  result: QueryResult;
  xKey: string;
  yKey: string;
}

export function BarChartView({ result, xKey, yKey }: BarChartViewProps) {
  return (
    <ResponsiveContainer width="100%" height={320}>
      <BarChart data={result.rows}>
        <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
        <XAxis dataKey={xKey} stroke="var(--text-3)" tick={{ fontSize: 12 }} />
        <YAxis stroke="var(--text-3)" tick={{ fontSize: 12 }} />
        <Tooltip contentStyle={{ background: "#1c1c27", border: "1px solid var(--border)", borderRadius: 8 }} />
        <Bar dataKey={yKey} fill={COLORS[0]} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

