"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

import type { QueryResult } from "@/types";

const COLORS = ["#6366f1", "#8b5cf6", "#10b981", "#f59e0b", "#ef4444", "#06b6d4"];

interface PieChartViewProps {
  result: QueryResult;
  nameKey: string;
  valueKey: string;
}

export function PieChartView({ result, nameKey, valueKey }: PieChartViewProps) {
  return (
    <ResponsiveContainer width="100%" height={320}>
      <PieChart>
        <Tooltip contentStyle={{ background: "#1c1c27", border: "1px solid var(--border)", borderRadius: 8 }} />
        <Pie data={result.rows} dataKey={valueKey} nameKey={nameKey} outerRadius={110}>
          {result.rows.map((_, index) => (
            <Cell key={index} fill={COLORS[index % COLORS.length]} />
          ))}
        </Pie>
      </PieChart>
    </ResponsiveContainer>
  );
}

