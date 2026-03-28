"use client";

import { Save } from "lucide-react";

import { ChartRenderer } from "@/components/charts/ChartRenderer";
import { Button } from "@/components/ui/button";
import type { ChartType, ChatMessage } from "@/types";

const TYPES: ChartType[] = ["bar", "line", "pie", "scatter", "area", "table"];

interface ResultPanelProps {
  message: ChatMessage | null;
  onChartTypeChange: (type: ChartType) => void;
  onSaveWidget: () => void;
}

export function ResultPanel({ message, onChartTypeChange, onSaveWidget }: ResultPanelProps) {
  if (!message?.result || !message.chartConfig) {
    return (
      <aside className="flex h-full w-[380px] items-center justify-center border-l border-border bg-surface-2 p-6">
        <div className="rounded-lg border border-dashed border-border p-5 text-center text-sm text-text-3">
          Run a query to view charts and result tables.
        </div>
      </aside>
    );
  }

  const activeType = message.chartConfig.type;

  return (
    <aside className="flex h-full w-full flex-col bg-transparent">
      <div className="border-b border-white/5 bg-white/5 px-4 py-3 backdrop-blur-md">
        <div className="flex flex-wrap gap-2">
          {TYPES.map((type) => (
            <button
              key={type}
              className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wider transition-all ${activeType === type ? "bg-accent text-text-1 shadow-lg shadow-accent/20" : "bg-white/5 text-text-2 hover:bg-white/10 hover:text-text-1"}`}
              onClick={() => onChartTypeChange(type)}
            >
              {type}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 p-4 overflow-auto scrollbar-hide">
        <div className="animate-fade-in h-full flex flex-col">
          <ChartRenderer result={message.result} chartConfig={message.chartConfig} />
        </div>
      </div>
      <div className="flex items-center justify-between border-t border-white/5 bg-white/5 px-4 py-3 text-[10px] font-medium text-text-2 backdrop-blur-md">
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse" />
          <span>
            {message.result.rowCount} rows · {message.result.executionTimeMs}ms
          </span>
        </div>
        <Button variant="ghost" size="sm" onClick={onSaveWidget} className="h-7 px-2 text-[10px] uppercase font-bold tracking-wider hover:bg-accent/10 hover:text-accent border-white/5">
          <Save className="mr-1.5 h-3 w-3" /> Save Result
        </Button>
      </div>
    </aside>

  );
}
