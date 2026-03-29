"use client";

import { useMemo, useState } from "react";
import { BarChart3, Code2, Save, Table2 } from "lucide-react";

import { ChartRenderer } from "@/components/charts/ChartRenderer";
import { TableView } from "@/components/charts/TableView";
import { CodeBlock } from "@/components/ui/code-block";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Tooltip } from "@/components/ui/tooltip";
import { toChartTypeOptions } from "@/lib/chartTypeOptions";
import type { ChartType, ChatMessage } from "@/types";

type ResultTab = "chart" | "table" | "sql";
const VISUAL_CHART_TYPES: ChartType[] = ["bar", "line", "area", "scatter", "pie"];

interface MessageResultCardProps {
  message: ChatMessage;
  onChartTypeChange: (messageId: string, type: ChartType) => void;
  onSaveWidget: (message: ChatMessage) => Promise<void>;
}

function getDefaultTab(message: ChatMessage): ResultTab {
  if (!message.result) return "sql";
  const hasVisualChart = Boolean(
    message.chartConfig?.availableTypes.some((type) => type !== "table"),
  );
  if (hasVisualChart) return "chart";
  if (message.result) return "table";
  return "sql";
}

export function MessageResultCard({
  message,
  onChartTypeChange,
  onSaveWidget,
}: MessageResultCardProps) {
  const [activeTab, setActiveTab] = useState<ResultTab>(() => getDefaultTab(message));
  const [saving, setSaving] = useState(false);

  const chartTypes = useMemo(() => {
    if (!message.result || message.result.rows.length === 0 || message.result.columns.length < 2) {
      return [];
    }

    const fromConfig =
      message.chartConfig?.availableTypes.filter((type) => type !== "table") ?? [];
    return Array.from(new Set([...fromConfig, ...VISUAL_CHART_TYPES]));
  }, [message.chartConfig, message.result]);

  const hasChart = chartTypes.length > 0;
  const activeChartType =
    message.chartConfig && message.chartConfig.type !== "table"
      ? message.chartConfig.type
      : chartTypes[0];
  const chartConfigForView =
    message.chartConfig && activeChartType
      ? { ...message.chartConfig, type: activeChartType }
      : null;

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSaveWidget(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-[#174128]/18 bg-[#f9fdf7] shadow-[0_12px_28px_rgba(14,41,24,0.08)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#174128]/10 bg-[linear-gradient(180deg,#eff9eb_0%,#f7fcf5_100%)] px-4 py-3">
        <div className="flex flex-wrap gap-2">
          {hasChart ? (
            <Tooltip content="Chart" side="bottom">
              <button
                aria-label="Chart"
                className={`inline-flex h-9 w-9 items-center justify-center rounded-full text-[11px] font-semibold uppercase tracking-[0.14em] transition ${
                  activeTab === "chart"
                    ? "bg-[#2ed52e] text-white shadow-[0_8px_20px_rgba(46,213,46,0.25)]"
                    : "border border-[#174128]/16 bg-white text-black hover:text-black"
                }`}
                onClick={() => setActiveTab("chart")}
              >
                <BarChart3 className={`h-4.5 w-4.5 ${activeTab === "chart" ? "text-white" : "text-black"}`} strokeWidth={2.4} />
              </button>
            </Tooltip>
          ) : null}
          <Tooltip content="Table" side="bottom">
            <button
              aria-label="Table"
              className={`inline-flex h-9 w-9 items-center justify-center rounded-full text-[11px] font-semibold uppercase tracking-[0.14em] transition ${
                activeTab === "table"
                  ? "bg-[#2ed52e] text-white shadow-[0_8px_20px_rgba(46,213,46,0.25)]"
                  : "border border-[#174128]/16 bg-white text-black hover:text-black"
              }`}
              onClick={() => setActiveTab("table")}
            >
              <Table2 className={`h-4.5 w-4.5 ${activeTab === "table" ? "text-white" : "text-black"}`} strokeWidth={2.4} />
            </button>
          </Tooltip>
          {message.sql ? (
            <Tooltip content="Generated SQL" side="bottom">
              <button
                aria-label="Generated SQL"
                className={`inline-flex h-9 w-9 items-center justify-center rounded-full text-[11px] font-semibold uppercase tracking-[0.14em] transition ${
                  activeTab === "sql"
                    ? "bg-[#2ed52e] text-white shadow-[0_8px_20px_rgba(46,213,46,0.25)]"
                    : "border border-[#174128]/16 bg-white text-black hover:text-black"
                }`}
                onClick={() => setActiveTab("sql")}
              >
                <Code2 className={`h-4.5 w-4.5 ${activeTab === "sql" ? "text-white" : "text-black"}`} strokeWidth={2.4} />
              </button>
            </Tooltip>
          ) : null}
        </div>
        <div className="flex items-center gap-2 text-[11px] text-black">
          {message.result ? (
            <span className="font-semibold">
              {message.result.rowCount} rows · {message.result.executionTimeMs}ms
            </span>
          ) : null}
          {message.result && message.chartConfig ? (
            <Button
              variant="ghost"
              size="sm"
              loading={saving}
              onClick={() => void handleSave()}
              className="h-8 rounded-full border border-[#174128]/18 bg-white px-3 text-[11px] font-semibold uppercase tracking-[0.14em] hover:bg-[#ebf8e4]"
            >
              <Save className="h-3.5 w-3.5" />
              Save
            </Button>
          ) : null}
        </div>
      </div>

      {activeTab === "chart" && hasChart && message.result && chartConfigForView ? (
        <div className="space-y-4 p-4">
          <div className="flex items-center justify-between gap-3">
            <Select
              value={activeChartType}
              onChange={(value) => onChartTypeChange(message.id, value as ChartType)}
              options={toChartTypeOptions(chartTypes)}
              className="h-9 min-w-[140px] max-w-[180px]"
            />
          </div>
          <div className="rounded-xl border border-[#174128]/16 bg-white p-3">
            <ChartRenderer result={message.result} chartConfig={chartConfigForView} />
          </div>
        </div>
      ) : null}

      {activeTab === "table" && message.result ? (
        <div className="p-4">
          <TableView result={message.result} />
        </div>
      ) : null}

      {activeTab === "sql" && message.sql ? (
        <div className="p-4">
          <CodeBlock sql={message.sql} />
        </div>
      ) : null}
    </div>
  );
}
