"use client";

import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

import type { QueryResult } from "@/types";
import { formatAxisTick } from "@/lib/charts/format";
import { formatFullAs, PLAIN_NUMBER, type ColumnFormat } from "@/lib/charts/semantics";

const COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--chart-3)",
  "var(--chart-6)",
];

interface PieChartViewProps {
  result: QueryResult;
  nameKey: string;
  valueKey: string;
  valueFormat?: ColumnFormat;
}

export function PieChartView({ result, nameKey, valueKey, valueFormat = PLAIN_NUMBER }: PieChartViewProps) {
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

  const total = pieRows.reduce((sum, row) => sum + Number(row[valueKey]), 0);
  const percentByName = new Map(
    pieRows.map((row) => [
      String(row[nameKey]),
      total > 0 ? (Number(row[valueKey]) / total) * 100 : 0,
    ]),
  );
  const percentLabel = (name: unknown) => {
    const pct = percentByName.get(String(name));
    return pct == null ? "" : ` · ${pct >= 10 ? Math.round(pct) : pct.toFixed(1)}%`;
  };

  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Tooltip
          contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, color: "var(--text)", fontSize: 12 }}
          formatter={(value, name) => [
            `${formatFullAs(value, valueFormat)}${percentLabel(name)}`,
            formatAxisTick(name),
          ]}
        />
        <Legend
          verticalAlign="bottom"
          height={42}
          iconType="circle"
          iconSize={8}
          wrapperStyle={{ fontSize: 12 }}
          formatter={(value) => `${formatAxisTick(value)}${percentLabel(value)}`}
        />
        <Pie
          data={pieRows}
          dataKey={valueKey}
          nameKey={nameKey}
          innerRadius="52%"
          outerRadius="82%"
          paddingAngle={2}
          cornerRadius={5}
          stroke="var(--surface)"
          strokeWidth={2}
        >
          {pieRows.map((_, index) => (
            <Cell key={index} fill={COLORS[index % COLORS.length]} />
          ))}
        </Pie>
      </PieChart>
    </ResponsiveContainer>
  );
}
