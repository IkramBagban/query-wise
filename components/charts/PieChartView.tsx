"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

import type { QueryResult } from "@/types";

const COLORS = ["#2ed52e", "#1fbf2f", "#27a73d", "#198e31", "#5be05b", "#0f6e28"];

interface PieChartViewProps {
  result: QueryResult;
  nameKey: string;
  valueKey: string;
}

export function PieChartView({ result, nameKey, valueKey }: PieChartViewProps) {
  return (
    <ResponsiveContainer width="100%" height={320}>
      <PieChart>
        <Tooltip contentStyle={{ background: "#ffffff", border: "1px solid var(--border)", borderRadius: 8 }} />
        <Pie data={result.rows} dataKey={valueKey} nameKey={nameKey} outerRadius={110}>
          {result.rows.map((_, index) => (
            <Cell key={index} fill={COLORS[index % COLORS.length]} />
          ))}
        </Pie>
      </PieChart>
    </ResponsiveContainer>
  );
}


