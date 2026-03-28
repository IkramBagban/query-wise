"use client";

import { ChartRenderer } from "@/components/charts/ChartRenderer";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import type { ChartType, DashboardWidget } from "@/types";

const TYPE_OPTIONS = [
  { label: "Bar", value: "bar" },
  { label: "Line", value: "line" },
  { label: "Pie", value: "pie" },
  { label: "Scatter", value: "scatter" },
  { label: "Area", value: "area" },
  { label: "Table", value: "table" },
] as const;

interface WidgetCardProps {
  widget: DashboardWidget;
  readOnly?: boolean;
  onTitleChange?: (title: string) => void;
  onTypeChange?: (type: ChartType) => void;
  onRemove?: () => void;
}

export function WidgetCard({
  widget,
  readOnly = false,
  onTitleChange,
  onTypeChange,
  onRemove,
}: WidgetCardProps) {
  return (
    <Card className="overflow-hidden rounded-2xl border border-[#174128]/18 bg-white shadow-[0_10px_26px_rgba(14,41,24,0.08)]" hoverable>
      <div className="flex items-center justify-between border-b border-[#174128]/12 bg-[linear-gradient(180deg,#eff9eb_0%,#f7fcf5_100%)] px-3 py-2">
        {readOnly ? (
          <h3 className="text-sm font-medium text-text-1">{widget.title}</h3>
        ) : (
          <input
            value={widget.title}
            onChange={(event) => onTitleChange?.(event.target.value)}
            className="w-full bg-transparent text-sm text-text-1 outline-none"
          />
        )}
        {!readOnly ? (
          <button onClick={onRemove} className="ml-3 rounded-full border border-danger/20 bg-danger/10 px-2 py-0.5 text-xs text-danger transition hover:bg-danger/20">
            Remove
          </button>
        ) : null}
      </div>
      {!readOnly ? (
        <div className="border-b border-[#174128]/10 bg-[#f9fdf7] px-3 py-2">
          <Select
            value={widget.chartConfig.type}
            onChange={(value) => onTypeChange?.(value as ChartType)}
            options={TYPE_OPTIONS.map((option) => ({ ...option }))}
            className="h-8 min-w-28"
          />
        </div>
      ) : null}
      <div className="p-3">
        <ChartRenderer result={widget.result} chartConfig={widget.chartConfig} />
      </div>
      <div className="border-t border-[#174128]/10 bg-[#f9fdf7] px-3 py-2 text-xs text-[#355442]">
        {widget.result.rowCount} rows · Last updated {new Date().toLocaleTimeString("en-US")}
      </div>
    </Card>
  );
}

