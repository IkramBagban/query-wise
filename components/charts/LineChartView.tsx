"use client";

import { useEffect, useState } from "react";
import {
  CartesianGrid,
  Legend,
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
  yKeys?: string[];
}

const LINE_COLORS = ["#2ed52e", "#f59e0b", "#ef4444", "#8b5cf6", "#14b8a6", "#84cc16"];
const labelize = (value: string) => value.replace(/_/g, " ");

export function LineChartView({ result, xKey, yKey, yKeys }: LineChartViewProps) {
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (!dragging) return;
    const onMouseUp = () => setDragging(false);
    window.addEventListener("mouseup", onMouseUp);
    return () => window.removeEventListener("mouseup", onMouseUp);
  }, [dragging]);

  const series = (yKeys && yKeys.length > 0 ? yKeys : [yKey]).filter(Boolean);
  return (
    <ResponsiveContainer width="100%" height={320}>
      <LineChart
        data={result.rows}
        onMouseDown={() => setDragging(true)}
        onMouseUp={() => setDragging(false)}
        onMouseLeave={() => setDragging(false)}
      >
        <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
        <XAxis dataKey={xKey} stroke="var(--text-3)" tick={{ fontSize: 12 }} />
        <YAxis stroke="var(--text-3)" tick={{ fontSize: 12 }} />
        <Tooltip
          active={dragging ? false : undefined}
          cursor={dragging ? false : undefined}
          contentStyle={{ background: "#ffffff", border: "1px solid var(--border)", borderRadius: 8 }}
          formatter={(value, name) => [value, labelize(String(name))]}
        />
        {series.length > 1 ? (
          <Legend wrapperStyle={{ fontSize: 12 }} formatter={(value) => labelize(String(value))} />
        ) : null}
        {series.map((seriesKey, index) => (
          <Line
            key={seriesKey}
            type="monotone"
            dataKey={seriesKey}
            name={labelize(seriesKey)}
            stroke={LINE_COLORS[index % LINE_COLORS.length]}
            strokeWidth={2}
            dot={false}
            activeDot={dragging ? false : { r: 4 }}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}


