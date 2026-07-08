"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, GripVertical, Lock, RefreshCw, Trash2 } from "lucide-react";

import { V2Chart, isBoundedResultPreview } from "@/components/V2Chart";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { BoundedResultPreview, ChartConfig, WidgetMode } from "@query-wise/shared/types";
import { CountUpNumber, FreshnessLabel } from "./primitives";

export interface LiveWidgetView {
  id: string;
  title: string;
  mode: WidgetMode;
  chartConfig: ChartConfig;
  preview: BoundedResultPreview;
  lastRefreshedAt: string | null;
  error: string | null;
  refreshing: boolean;
  filterBound: boolean;
  /** Increments to trigger the "intentionally not changed" border pulse. */
  pulseKey: number;
}

export function LiveWidgetCard({
  view,
  isEditing,
  onRefresh,
  onRemove,
  removing,
}: {
  view: LiveWidgetView;
  isEditing: boolean;
  onRefresh: () => void;
  onRemove?: () => void;
  removing?: boolean;
}) {
  const rows = isBoundedResultPreview(view.preview) ? view.preview.returnedRowCount : undefined;
  const isSnapshot = view.mode === "snapshot";

  // §8b: replay the "intentionally not changed" border pulse on each range change
  // without remounting the card (which would re-flash the chart).
  const [pulsing, setPulsing] = useState(false);
  const lastPulse = useRef(view.pulseKey);
  useEffect(() => {
    if (view.pulseKey === lastPulse.current) return;
    lastPulse.current = view.pulseKey;
    if (view.pulseKey <= 0) return;
    setPulsing(true);
    const timer = window.setTimeout(() => setPulsing(false), 620);
    return () => window.clearTimeout(timer);
  }, [view.pulseKey]);

  return (
    <Card
      className={cn(
        "group/widget relative flex h-full flex-col overflow-hidden rounded-xl transition-all duration-200",
        isEditing ? "border-accent-line shadow-[0_0_0_3px_var(--accent-soft)]" : "hover:border-border-2",
        pulsing && "qw-border-pulse",
      )}
    >
      {/* SPEC-06 §8b: 2px indeterminate progress bar while refreshing. */}
      {view.refreshing ? <span aria-hidden className="qw-live-bar" /> : null}

      <div
        className={cn(
          "flex shrink-0 items-center gap-2 border-b border-border bg-surface-2/50 px-3.5 py-2.5",
          isEditing && "cursor-grab active:cursor-grabbing",
        )}
      >
        {isEditing ? <GripVertical className="size-3.5 shrink-0 text-faint" strokeWidth={1.75} aria-hidden /> : null}
        <h2 className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-text">{view.title}</h2>

        {isSnapshot ? (
          <span className="hidden shrink-0 items-center gap-1 rounded-full border border-border bg-surface px-2 py-0.5 font-mono text-[10px] text-faint sm:inline-flex">
            <Lock className="size-2.5" strokeWidth={2} /> Snapshot
          </span>
        ) : null}

        {typeof rows === "number" ? (
          <span className="hidden shrink-0 whitespace-nowrap rounded-full border border-border bg-surface px-2 py-0.5 font-mono text-[10px] text-faint sm:block">
            <CountUpNumber value={rows} /> {rows === 1 ? "row" : "rows"}
          </span>
        ) : null}

        {view.error ? (
          <span
            title={view.error}
            className="inline-flex size-4 shrink-0 items-center justify-center text-warning"
            aria-label={`Refresh problem: ${view.error}`}
          >
            <AlertCircle className="size-3.5" />
          </span>
        ) : null}

        {isEditing && onRemove ? (
          <Button
            size="sm"
            variant="danger"
            aria-label={`Remove ${view.title}`}
            className="h-7 w-7 shrink-0 p-0"
            loading={removing}
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        ) : !isSnapshot ? (
          <button
            type="button"
            aria-label={`Refresh ${view.title}`}
            title="Refresh"
            disabled={view.refreshing}
            onClick={(e) => {
              e.stopPropagation();
              onRefresh();
            }}
            className="inline-flex size-6 shrink-0 items-center justify-center rounded-md text-faint transition hover:bg-surface-2 hover:text-text disabled:opacity-60"
          >
            <RefreshCw className={cn("size-3.5", view.refreshing && "qw-spin-once")} />
          </button>
        ) : null}
      </div>

      {/* SPEC-06 §6/§8b: the chart stays mounted and dims to ~60% during refresh —
          never blank-then-repaint. (Click-to-drill / "Ask about this" removed per
          product decision.) */}
      <div
        className="min-h-0 flex-1 overflow-hidden p-3 transition-opacity duration-200"
        style={{ opacity: view.refreshing ? 0.6 : 1 }}
      >
        <div className="h-full w-full">
          <V2Chart preview={view.preview} config={view.chartConfig} />
        </div>
      </div>

      {!isEditing ? (
        <div className="flex shrink-0 items-center justify-between gap-2 border-t border-border/70 px-3.5 py-1.5 text-[10.5px]">
          {isSnapshot ? (
            <span className="font-mono text-faint">snapshot · not affected by filter</span>
          ) : (
            <FreshnessLabel lastRefreshedAt={view.lastRefreshedAt} />
          )}
          {!isSnapshot && !view.filterBound ? (
            <span className="font-mono text-faint/80">not time-filtered</span>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}
