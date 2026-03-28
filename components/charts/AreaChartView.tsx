"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
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
}

export function AreaChartView({ result, xKey, yKey }: AreaChartViewProps) {
  return (
    <ResponsiveContainer width="100%" height={320}>
      <AreaChart data={result.rows}>
        <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
        <XAxis dataKey={xKey} stroke="var(--text-3)" tick={{ fontSize: 12 }} />
        <YAxis stroke="var(--text-3)" tick={{ fontSize: 12 }} />
        <Tooltip contentStyle={{ background: "#ffffff", border: "1px solid var(--border)", borderRadius: 8 }} />
        <Area type="monotone" dataKey={yKey} stroke="#2ed52e" fill="rgba(46,213,46,0.3)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}


