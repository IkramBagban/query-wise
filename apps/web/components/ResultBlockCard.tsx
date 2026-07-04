"use client";

import { useState } from "react";
import {
  AreaChart,
  BarChart3,
  Code2,
  LineChart,
  PieChart,
  ScatterChart,
  Table2,
} from "lucide-react";

import { TableView } from "@/components/charts/TableView";
import { CodeBlock } from "@/components/ui/code-block";
import { Tooltip } from "@/components/ui/tooltip";
import { previewToQueryResult, V2Chart } from "@/components/V2Chart";
import { formatNumber } from "@/lib/utils";
import type { BoundedResultPreview, ChartConfig, ChartType } from "@query-wise/shared/types";

/**
 * The one result-block card. Rendered identically while the agent is still
 * streaming (skeleton → live chart) and after the message is persisted, so a
 * completed run never visually "swaps" — actions and menus are injected by
 * the finalized wrapper via the `actions` slot.
 */

const CHART_TYPES: { label: string; value: ChartType; icon: typeof BarChart3 }[] = [
  { label: "Bar", value: "bar", icon: BarChart3 },
  { label: "Line", value: "line", icon: LineChart },
  { label: "Area", value: "area", icon: AreaChart },
  { label: "Pie", value: "pie", icon: PieChart },
  { label: "Scatter", value: "scatter", icon: ScatterChart },
];

type CardTab = "chart" | "table" | "sql";

const TABS: { value: CardTab; label: string; icon: typeof BarChart3 }[] = [
  { value: "chart", label: "Chart", icon: BarChart3 },
  { value: "table", label: "Table", icon: Table2 },
  { value: "sql", label: "SQL", icon: Code2 },
];

export interface ResultBlockCardProps {
  title?: string | null;
  preview: BoundedResultPreview | null | undefined;
  sql?: string | null;
  rowCount?: number | null;
  executionTimeMs?: number | null;
  chartConfig?: ChartConfig | null;
  /** True while the query is still executing (skeleton body, pulsing header). */
  running?: boolean;
  /** Finalized-only controls (expand, export, save to dashboard). */
  actions?: React.ReactNode;
  /** Notifies the wrapper (dialog, save flow) when the user switches chart type. */
  onChartTypeChange?: (type: ChartType) => void;
}

function ChartTypeSwitcher({
  value,
  onChange,
}: {
  value: ChartType;
  onChange: (type: ChartType) => void;
}) {
  return (
    <div className="flex items-center gap-0.5 rounded-lg border border-border bg-surface-2/60 p-0.5" role="group" aria-label="Chart type">
      {CHART_TYPES.map(({ label, value: type, icon: Icon }) => (
        <Tooltip key={type} content={label} side="top">
          <button
            type="button"
            aria-label={`${label} chart`}
            aria-pressed={value === type}
            onClick={() => onChange(type)}
            className={`inline-flex size-7 items-center justify-center rounded-md transition ${
              value === type ? "bg-accent-dim text-accent-2 shadow-sm" : "text-text-3 hover:text-text-1"
            }`}
          >
            <Icon className="size-3.5" />
          </button>
        </Tooltip>
      ))}
    </div>
  );
}

function ChartSkeleton({ label }: { label: string }) {
  const heights = [42, 66, 88, 58, 74, 34, 50, 92, 62, 44, 70, 56];
  return (
    <div className="flex h-64 flex-col justify-end gap-3 p-4 sm:h-72" role="status" aria-label={label}>
      <div className="flex flex-1 items-end gap-2">
        {heights.map((height, index) => (
          <div
            key={index}
            className="skeleton-shimmer flex-1 rounded-t-md bg-accent/10"
            style={{ height: `${height}%`, animationDelay: `${index * 70}ms` }}
          />
        ))}
      </div>
      <p className="flex items-center gap-2 text-xs text-text-3">
        <span className="relative flex size-2">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-accent opacity-60" />
          <span className="relative inline-flex size-2 rounded-full bg-accent" />
        </span>
        {label}
      </p>
    </div>
  );
}

export function ResultBlockCard({
  title,
  preview,
  sql,
  rowCount,
  executionTimeMs,
  chartConfig,
  running,
  actions,
  onChartTypeChange,
}: ResultBlockCardProps) {
  const [tab, setTab] = useState<CardTab>("chart");
  const [userPickedType, setUserPickedType] = useState(false);
  const [chartType, setChartType] = useState<ChartType>(chartConfig?.type ?? "bar");

  // Follow the agent's refined chart choice (set_chart streaming in) until the
  // user takes over by picking a type themselves. Adjusted during render (the
  // React-endorsed pattern) so the refinement applies without an extra pass.
  const agentType = chartConfig?.type;
  const [seenAgentType, setSeenAgentType] = useState(agentType);
  if (agentType !== seenAgentType) {
    setSeenAgentType(agentType);
    if (!userPickedType && agentType) setChartType(agentType);
  }

  const pickType = (type: ChartType) => {
    setUserPickedType(true);
    setChartType(type);
    onChartTypeChange?.(type);
  };

  const config: ChartConfig = { ...(chartConfig ?? { schemaVersion: 1, type: "table" }), type: chartType };
  const hasData = Boolean(preview);
  const statsLabel =
    rowCount != null
      ? `${formatNumber(rowCount)} row${rowCount === 1 ? "" : "s"}${executionTimeMs != null ? ` · ${executionTimeMs}ms` : ""}`
      : null;

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-[0_1px_0_rgba(255,255,255,0.03)_inset,0_8px_28px_rgba(0,0,0,0.16)]">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-border/80 bg-surface-2/40 px-4 py-2.5">
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-text-1">
          {title || "Query result"}
        </span>
        {running ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/25 bg-accent-dim px-2 py-0.5 text-[10px] font-medium text-accent-2">
            <span className="relative flex size-1.5">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-accent opacity-60" />
              <span className="relative inline-flex size-1.5 rounded-full bg-accent" />
            </span>
            Running
          </span>
        ) : statsLabel ? (
          <span className="tabular-nums text-[11px] text-text-3">{statsLabel}</span>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 px-3 pt-2.5">
        <div className="flex items-center gap-0.5 rounded-lg border border-border bg-surface-2/60 p-0.5" role="tablist" aria-label="Result view">
          {TABS.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={tab === value}
              onClick={() => setTab(value)}
              className={`inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition ${
                tab === value ? "bg-surface text-text-1 shadow-sm" : "text-text-3 hover:text-text-1"
              }`}
            >
              <Icon className="size-3.5" />
              {label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          {tab === "chart" && hasData ? <ChartTypeSwitcher value={chartType} onChange={pickType} /> : null}
          {actions}
        </div>
      </div>

      <div className="p-3">
        {tab === "chart" ? (
          hasData ? (
            <div className="h-64 min-w-0 rounded-xl border border-border/70 bg-surface-2/30 p-2 sm:h-72">
              <V2Chart preview={preview} config={config} />
            </div>
          ) : (
            <div className="rounded-xl border border-border/70 bg-surface-2/30">
              <ChartSkeleton label={running ? "Running query…" : "Waiting for data…"} />
            </div>
          )
        ) : null}
        {tab === "table" ? (
          hasData && preview ? (
            <div className="max-h-72 overflow-auto rounded-xl border border-border/70">
              <TableView result={previewToQueryResult(preview)} />
            </div>
          ) : (
            <p className="rounded-xl border border-dashed border-border p-4 text-xs text-text-3">
              {running ? "The query is still running." : "No rows to show yet."}
            </p>
          )
        ) : null}
        {tab === "sql" ? (
          sql ? (
            <CodeBlock sql={sql} variant="dark" />
          ) : (
            <p className="rounded-xl border border-dashed border-border p-4 text-xs text-text-3">
              No SQL was generated for this response.
            </p>
          )
        ) : null}
      </div>
    </div>
  );
}
