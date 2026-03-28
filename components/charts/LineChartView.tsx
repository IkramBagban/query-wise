"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { QueryResult } from "@/types";

interface LineChartViewProps {
  result: QueryResult;
  xKey: string;
  yKey: string;
}

export function LineChartView({ result, xKey, yKey }: LineChartViewProps) {
  return (
    <ResponsiveContainer width="100%" height={320}>
      <LineChart data={result.rows}>
        <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
        <XAxis dataKey={xKey} stroke="var(--text-3)" tick={{ fontSize: 12 }} />
        <YAxis stroke="var(--text-3)" tick={{ fontSize: 12 }} />
        <Tooltip contentStyle={{ background: "#ffffff", border: "1px solid var(--border)", borderRadius: 8 }} />
        <Line type="monotone" dataKey={yKey} stroke="#2ed52e" strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}


