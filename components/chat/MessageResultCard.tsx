"use client";

import { useMemo, useState } from "react";
import { BarChart3, Code2, Expand, Save } from "lucide-react";

import { ChartRenderer } from "@/components/charts/ChartRenderer";
import { TableView } from "@/components/charts/TableView";
import { CodeBlock } from "@/components/ui/code-block";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Select } from "@/components/ui/select";
import { Tooltip } from "@/components/ui/tooltip";
import { toChartTypeOptions } from "@/lib/chartTypeOptions";
import type { ChartType, ChatMessage } from "@/types";

type ResultTab = "chart" | "sql";

interface MessageResultCardProps {
  message: ChatMessage;
  onChartTypeChange: (messageId: string, type: ChartType) => void;
  onSaveWidget: (message: ChatMessage) => Promise<void>;
}

function getDefaultTab(message: ChatMessage): ResultTab {
  if (!message.result) return "sql";
  return "chart";
}

export function MessageResultCard({
  message,
  onChartTypeChange,
  onSaveWidget,
}: MessageResultCardProps) {
  const [activeTab, setActiveTab] = useState<ResultTab>(() => getDefaultTab(message));
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const chartTypes = useMemo(() => {
    if (!message.result) {
      return [];
    }

    const fromConfig = message.chartConfig?.availableTypes ?? ["table"];
    return Array.from(new Set(fromConfig));
  }, [message.chartConfig, message.result]);

  const hasResultView = chartTypes.length > 0;
  const activeChartType = message.chartConfig?.type ?? chartTypes[0];
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

  const renderCard = (isExpanded: boolean) => (
    <div
      className={`overflow-visible rounded-2xl border border-[#174128]/18 bg-[#f9fdf7] shadow-[0_12px_28px_rgba(14,41,24,0.08)] ${
        isExpanded ? "min-h-[520px]" : ""
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#174128]/10 bg-[linear-gradient(180deg,#eff9eb_0%,#f7fcf5_100%)] px-4 py-3">
        <div className="flex flex-wrap gap-2">
          {hasResultView ? (
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
          {!isExpanded ? (
            <Tooltip content="Expand" side="bottom">
              <button
                type="button"
                aria-label="Expand result"
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#174128]/18 bg-white transition hover:bg-[#ebf8e4]"
                onClick={() => setExpanded(true)}
              >
                <Expand className="h-3.5 w-3.5 text-black" />
              </button>
            </Tooltip>
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

      {activeTab === "chart" && hasResultView && message.result && chartConfigForView ? (
        <div className={`space-y-4 p-4 ${isExpanded ? "min-h-[440px]" : ""}`}>
          <div className="flex items-center justify-between gap-3">
            <Select
              value={activeChartType}
              onChange={(value) => onChartTypeChange(message.id, value as ChartType)}
              options={toChartTypeOptions(chartTypes)}
              className="h-9 min-w-[140px] max-w-[180px]"
            />
          </div>
          <div className={`rounded-xl border border-[#174128]/16 bg-white p-3 ${isExpanded ? "h-[380px]" : ""}`}>
            {chartConfigForView.type === "table" ? (
              <TableView result={message.result} />
            ) : (
              <ChartRenderer result={message.result} chartConfig={chartConfigForView} />
            )}
          </div>
        </div>
      ) : null}

      {activeTab === "sql" && message.sql ? (
        <div className={`p-4 ${isExpanded ? "max-h-[520px] overflow-y-auto" : ""}`}>
          <CodeBlock sql={message.sql} />
        </div>
      ) : null}
    </div>
  );

  return (
    <>
      {renderCard(false)}
      <Dialog
        open={expanded}
        onOpenChange={setExpanded}
        panelClassName="max-w-6xl p-4"
      >
        {renderCard(true)}
      </Dialog>
    </>
  );
}
