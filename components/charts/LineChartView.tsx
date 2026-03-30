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
const isDateLikeValue = (value: unknown): boolean => {
  const text = String(value ?? "");
  return /[-/:T]/.test(text) && !Number.isNaN(Date.parse(text));
};
const shortXAxisTick = (value: unknown): string => {
  const text = String(value ?? "");
  if (isDateLikeValue(value)) {
    const date = new Date(text);
    const hasTime =
      date.getHours() !== 0 ||
      date.getMinutes() !== 0 ||
      date.getSeconds() !== 0;
    return hasTime
      ? date.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric" })
      : date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }
  return text.length > 16 ? `${text.slice(0, 16)}…` : text;
};

export function LineChartView({ result, xKey, yKey, yKeys }: LineChartViewProps) {
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (!dragging) return;
    const onMouseUp = () => setDragging(false);
    window.addEventListener("mouseup", onMouseUp);
    return () => window.removeEventListener("mouseup", onMouseUp);
  }, [dragging]);

  const series = (yKeys && yKeys.length > 0 ? yKeys : [yKey]).filter(Boolean);
  const sampleLabel = result.rows[0]?.[xKey];
  const isDateLikeAxis = isDateLikeValue(sampleLabel);
  const hasLongLabels = result.rows.some((row) => String(row[xKey] ?? "").length > 10);
  const isVeryDenseAxis = result.rows.length > 20;
  const shouldRotateTicks = result.rows.length > 8 || (!isDateLikeAxis && hasLongLabels);
  const tickInterval: number | "preserveStartEnd" = isVeryDenseAxis ? "preserveStartEnd" : 0;
  return (
    <ResponsiveContainer width="100%" height={320}>
      <LineChart
        data={result.rows}
        margin={{ top: 8, right: 10, left: 6, bottom: shouldRotateTicks ? 52 : 16 }}
        onMouseDown={() => setDragging(true)}
        onMouseUp={() => setDragging(false)}
        onMouseLeave={() => setDragging(false)}
      >
        <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
        <XAxis
          dataKey={xKey}
          stroke="var(--text-3)"
          tick={{ fontSize: 11 }}
          tickFormatter={shortXAxisTick}
          interval={tickInterval}
          angle={shouldRotateTicks ? -35 : 0}
          textAnchor={shouldRotateTicks ? "end" : "middle"}
          tickMargin={shouldRotateTicks ? 10 : 6}
          height={shouldRotateTicks ? 56 : 26}
          minTickGap={18}
        />
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


