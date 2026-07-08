"use client";

import { useEffect, useState } from "react";
import {
  Brush,
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
import { formatAxisTick, formatValue, isDateLikeValue, labelize } from "@/lib/charts/format";
import { formatCompactAs, formatFullAs, PLAIN_NUMBER, type ColumnFormat } from "@/lib/charts/semantics";
import { secondaryAxisSeries } from "@/lib/charts/transforms";

interface LineChartViewProps {
  result: QueryResult;
  xKey: string;
  yKey: string;
  yKeys?: string[];
  valueFormat?: ColumnFormat;
}

const LINE_COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)", "var(--chart-6)"];

export function LineChartView({ result, xKey, yKey, yKeys, valueFormat = PLAIN_NUMBER }: LineChartViewProps) {
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
  // Auto secondary axis: with exactly two series of very different magnitude,
  // put the smaller one on a right axis so it isn't flattened.
  const secondaryKey = secondaryAxisSeries(result.rows, series);
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart
        data={result.rows}
        margin={{ top: 8, right: secondaryKey ? 10 : 10, left: 6, bottom: shouldRotateTicks ? 52 : 16 }}
        onMouseDown={() => setDragging(true)}
        onMouseUp={() => setDragging(false)}
        onMouseLeave={() => setDragging(false)}
      >
        <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
        <XAxis
          dataKey={xKey}
          stroke="var(--faint)"
          tick={{ fontSize: 11 }}
          tickFormatter={formatAxisTick}
          interval={tickInterval}
          angle={shouldRotateTicks ? -35 : 0}
          textAnchor={shouldRotateTicks ? "end" : "middle"}
          tickMargin={shouldRotateTicks ? 10 : 6}
          height={shouldRotateTicks ? 56 : 26}
          minTickGap={18}
        />
        <YAxis yAxisId="left" stroke="var(--faint)" tick={{ fontSize: 12 }} tickFormatter={(value) => formatCompactAs(value, valueFormat)} width={52} />
        {secondaryKey ? (
          <YAxis yAxisId="right" orientation="right" stroke="var(--faint)" tick={{ fontSize: 12 }} tickFormatter={(value) => formatCompactAs(value, valueFormat)} width={52} />
        ) : null}
        <Tooltip
          cursor={{ stroke: "var(--border)", strokeWidth: 1, strokeDasharray: "3 3" }}
          contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text)" }}
          labelFormatter={(label) => formatValue(label)}
          formatter={(value, name) => [formatFullAs(value, valueFormat), labelize(String(name))]}
        />
        {series.length > 1 ? (
          <Legend wrapperStyle={{ fontSize: 12 }} formatter={(value) => labelize(String(value))} />
        ) : null}
        {series.map((seriesKey, index) => (
          <Line
            key={seriesKey}
            yAxisId={secondaryKey === seriesKey ? "right" : "left"}
            type="monotone"
            dataKey={seriesKey}
            name={labelize(seriesKey)}
            stroke={LINE_COLORS[index % LINE_COLORS.length]}
            strokeWidth={2}
            dot={false}
            activeDot={dragging ? false : { r: 4 }}
          />
        ))}
        {result.rows.length > 30 ? (
          <Brush
            dataKey={xKey}
            height={26}
            travellerWidth={8}
            stroke="var(--accent)"
            fill="var(--surface2)"
            tickFormatter={formatAxisTick}
          />
        ) : null}
      </LineChart>
    </ResponsiveContainer>
  );
}


