"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BarChart3, Check, ChevronDown, Code2, Expand, Save } from "lucide-react";

import { ChartRenderer } from "@/components/charts/ChartRenderer";
import { TableView } from "@/components/charts/TableView";
import { CodeBlock } from "@/components/ui/code-block";
import { Dialog } from "@/components/ui/dialog";
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
  const [chartMenuOpen, setChartMenuOpen] = useState(false);
  const chartMenuRef = useRef<HTMLDivElement | null>(null);

  const chartTypes = useMemo(() => {
    if (!message.result) {
      return [];
    }

    const fromConfig = message.chartConfig?.availableTypes ?? ["table"];
    return Array.from(new Set(fromConfig));
  }, [message.chartConfig, message.result]);
  const chartTypeOptions = useMemo(() => toChartTypeOptions(chartTypes), [chartTypes]);

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

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!chartMenuRef.current?.contains(event.target as Node)) {
        setChartMenuOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setChartMenuOpen(false);
    };
    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);

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
                    : "border border-[#174128]/16 bg-white text-black"
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
                    : "border border-[#174128]/16 bg-white text-black"
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
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#174128]/18 bg-white transition"
                onClick={() => setExpanded(true)}
              >
                <Expand className="h-3.5 w-3.5 text-black" />
              </button>
            </Tooltip>
          ) : null}
          {message.result && message.chartConfig ? (
            <button
              type="button"
              disabled={saving}
              onClick={() => void handleSave()}
              className="inline-flex h-8 items-center justify-center gap-2 rounded-full border border-[#174128]/18 bg-white px-3 text-[11px] font-semibold uppercase tracking-[0.14em] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? (
                <span className="inline-flex h-3.5 w-3.5 animate-spin rounded-full border-2 border-[#174128]/40 border-t-[#174128]" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )}
              <span>{saving ? "Saving" : "Save"}</span>
            </button>
          ) : null}
        </div>
      </div>

      {activeTab === "chart" && hasResultView && message.result && chartConfigForView ? (
        <div className={`space-y-4 p-4 ${isExpanded ? "min-h-[440px]" : ""}`}>
          <div className="flex items-center justify-between gap-3">
            <div ref={chartMenuRef} className="relative inline-flex min-w-[140px] max-w-[180px]">
              <button
                type="button"
                className="inline-flex h-9 w-full items-center justify-between gap-2 rounded-md border border-border bg-surface px-3 text-left text-xs text-text-1"
                onClick={() => setChartMenuOpen((prev) => !prev)}
              >
                <span className="truncate">
                  {chartTypeOptions.find((option) => option.value === activeChartType)?.label ?? "Select"}
                </span>
                <ChevronDown className={`h-3.5 w-3.5 text-text-3 transition-transform ${chartMenuOpen ? "rotate-180" : ""}`} />
              </button>

              {chartMenuOpen ? (
                <div className="absolute left-0 top-10 z-50 w-full overflow-hidden rounded-md border border-border-2 bg-surface-2 p-1 shadow-2xl">
                  {chartTypeOptions.map((option) => {
                    const isActive = option.value === activeChartType;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        className={`flex w-full items-center justify-between rounded px-2 py-1.5 text-xs ${
                          isActive ? "bg-accent/20 text-text-1" : "text-text-2"
                        }`}
                        onClick={() => {
                          onChartTypeChange(message.id, option.value as ChartType);
                          setChartMenuOpen(false);
                        }}
                      >
                        <span className="truncate">{option.label}</span>
                        {isActive ? <Check className="h-3.5 w-3.5 text-accent" /> : null}
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
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
