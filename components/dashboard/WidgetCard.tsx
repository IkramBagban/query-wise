"use client";

import { Trash2 } from "lucide-react";

import { ChartRenderer } from "@/components/charts/ChartRenderer";
import { Card } from "@/components/ui/card";
import type { DashboardWidget } from "@/types";

interface WidgetCardProps {
  widget: DashboardWidget;
  readOnly?: boolean;
  onRemove?: () => void;
}

export function WidgetCard({
  widget,
  readOnly = false,
  onRemove,
}: WidgetCardProps) {
  return (
    <Card
      className="relative overflow-hidden rounded-2xl border border-[#174128]/18 bg-white shadow-[0_10px_26px_rgba(14,41,24,0.08)]"
      hoverable
    >
      {!readOnly ? (
        <button
          onClick={onRemove}
          className="absolute right-3 top-3 z-10 rounded-full border border-danger/30 bg-white/95 p-1.5 text-danger transition hover:bg-danger/10"
          aria-label={`Remove ${widget.title}`}
        >
          <Trash2 className="h-4 w-4" />
        </button>
      ) : null}
      <div className="p-3">
        <ChartRenderer result={widget.result} chartConfig={widget.chartConfig} />
      </div>
    </Card>
  );
}

