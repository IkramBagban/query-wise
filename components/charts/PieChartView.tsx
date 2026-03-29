"use client";

import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

import type { QueryResult } from "@/types";

const COLORS = ["#2ed52e", "#f59e0b", "#ef4444", "#8b5cf6", "#14b8a6", "#84cc16"];
const labelize = (value: string) => value.replace(/_/g, " ");

interface PieChartViewProps {
  result: QueryResult;
  nameKey: string;
  valueKey: string;
}

export function PieChartView({ result, nameKey, valueKey }: PieChartViewProps) {
  const pieRows = result.rows
    .map((row) => {
      const raw = row[valueKey];
      const parsed =
        typeof raw === "number"
          ? raw
          : typeof raw === "string"
            ? Number(raw)
            : NaN;
      return {
        ...row,
        [valueKey]: Number.isFinite(parsed) ? parsed : 0,
      };
    })
    .filter((row) => Number(row[valueKey]) > 0);

  return (
    <ResponsiveContainer width="100%" height={320}>
      <PieChart>
        <Tooltip
          contentStyle={{ background: "#ffffff", border: "1px solid var(--border)", borderRadius: 8 }}
          formatter={(value, name) => [value, labelize(String(name))]}
        />
        <Legend
          verticalAlign="bottom"
          height={42}
          iconType="circle"
          wrapperStyle={{ fontSize: 12 }}
          formatter={(value) => labelize(String(value))}
        />
        <Pie data={pieRows} dataKey={valueKey} nameKey={nameKey} outerRadius={110}>
          {pieRows.map((_, index) => (
            <Cell key={index} fill={COLORS[index % COLORS.length]} />
          ))}
        </Pie>
      </PieChart>
    </ResponsiveContainer>
  );
}


