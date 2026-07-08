"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Check, LayoutGrid, RefreshCw, RotateCcw } from "lucide-react";
import { ResponsiveGridLayout, useContainerWidth, verticalCompactor } from "react-grid-layout";
import type { Layout, LayoutItem } from "react-grid-layout";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { dashboardsApi } from "@/lib/api-client";
import type { DashboardDto } from "@/lib/api-client";
import type { BoundedResultPreview, DashboardDateRange, WidgetMode } from "@query-wise/shared/types";
import { isBoundedResultPreview } from "@/components/V2Chart";
import { DateRangePicker, ModeToggle } from "@/components/dashboard/primitives";
import { LiveWidgetCard, type LiveWidgetView } from "@/components/dashboard/LiveWidgetCard";
// Click-to-drill / "Ask about this" (SPEC-06 §7) removed per product decision.
// import { DrillDrawer, type DrillTarget } from "@/components/dashboard/DrillDrawer";

type DashboardWidget = DashboardDto["widgets"][number];

const STALENESS_MS = 10 * 60 * 1000; // §4.2 default staleness window
const WAVE_STAGGER_MS = 60; // §8b staggered refresh wave

export interface DashboardGridProps {
  widgets: DashboardWidget[];
  dashboardId: string;
  isEditing: boolean;
  onLayoutSaved?: () => void;
  busyWidget?: string | null;
  onRemoveWidget?: (widgetId: string) => void;
  canRefresh?: boolean;
  mode?: WidgetMode;
  defaultDateRange?: DashboardDateRange | null;
  refreshIntervalSeconds?: number | null;
}

export function WidgetCardSkeleton() {
  return (
    <Card className="flex flex-col overflow-hidden">
      <div className="border-b border-border px-4 py-3">
        <Skeleton className="h-4 w-2/5" />
      </div>
      <div className="min-h-24 flex-1 p-3">
        <Skeleton className="h-full w-full rounded-md" />
      </div>
    </Card>
  );
}

function widgetsToLayout(widgets: DashboardWidget[]): Layout {
  return widgets.map(
    (w): LayoutItem => ({ i: w.id, x: w.layout.x, y: w.layout.y, w: w.layout.w, h: w.layout.h, minW: 2, minH: 3 }),
  );
}

function copyLayout(layout: Layout): Layout {
  return layout.map((item) => ({ ...item }));
}

/* --------------------------- live widget state ---------------------------- */

interface WidgetState {
  preview: BoundedResultPreview;
  lastRefreshedAt: string | null;
  error: string | null;
  refreshing: boolean;
  pulseKey: number;
}

function initialStates(widgets: DashboardWidget[]): Record<string, WidgetState> {
  const map: Record<string, WidgetState> = {};
  for (const widget of widgets) {
    map[widget.id] = {
      preview: widget.snapshot as BoundedResultPreview,
      lastRefreshedAt: widget.lastRefreshedAt ?? null,
      error: widget.lastRefreshError ?? null,
      refreshing: false,
      pulseKey: 0,
    };
  }
  return map;
}

function isStale(lastRefreshedAt: string | null, windowMs: number): boolean {
  if (!lastRefreshedAt) return true;
  return Date.now() - new Date(lastRefreshedAt).getTime() > windowMs;
}

export function DashboardGrid({
  widgets,
  dashboardId,
  isEditing,
  onLayoutSaved,
  busyWidget = null,
  onRemoveWidget,
  canRefresh = false,
  mode: modeProp = "live",
  defaultDateRange = null,
  refreshIntervalSeconds = null,
}: DashboardGridProps) {
  const { containerRef, width, mounted } = useContainerWidth({ initialWidth: 1280 });
  const [layout, setLayout] = useState<Layout>(() => widgetsToLayout(widgets));
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const confirmedLayoutRef = useRef<Layout>(widgetsToLayout(widgets));
  const pendingLayoutRef = useRef<Layout | null>(null);
  const failedLayoutRef = useRef<Layout | null>(null);
  const savingRef = useRef(false);
  const scopeRef = useRef(0);
  const previousEditingRef = useRef(isEditing);

  /* ---------------------------- live state ------------------------------- */

  const [states, setStates] = useState<Record<string, WidgetState>>(() => initialStates(widgets));
  const [range, setRange] = useState<DashboardDateRange | null>(defaultDateRange);
  const [mode, setMode] = useState<WidgetMode>(modeProp);
  const [refreshingAll, setRefreshingAll] = useState(false);
  const statesRef = useRef(states);
  statesRef.current = states;

  const isLive = mode === "live";
  const widgetMap = useMemo(() => new Map(widgets.map((w) => [w.id, w])), [widgets]);
  // Whole-dashboard mode: every widget is live iff the dashboard is live.
  const liveWidgets = useMemo(() => (isLive ? widgets : []), [isLive, widgets]);
  const hasFilterBound = useMemo(() => widgets.some((w) => Boolean(w.filterBinding)), [widgets]);

  const setWidgetState = useCallback((id: string, patch: Partial<WidgetState>) => {
    setStates((prev) => (prev[id] ? { ...prev, [id]: { ...prev[id], ...patch } } : prev));
  }, []);

  const refreshOne = useCallback(
    async (widgetId: string, nextRange: DashboardDateRange | null) => {
      const widget = widgetMap.get(widgetId);
      if (!widget) return;
      setWidgetState(widgetId, { refreshing: true });
      try {
        const result = await dashboardsApi.refreshWidget(dashboardId, widgetId, {
          range: nextRange ?? null,
          force: true,
        });
        if (result.status === "ok" && result.result) {
          setWidgetState(widgetId, {
            preview: result.result,
            lastRefreshedAt: result.lastRefreshedAt,
            error: null,
            refreshing: false,
          });
        } else if (result.status === "error") {
          setWidgetState(widgetId, { error: result.error?.message ?? "Couldn't refresh.", refreshing: false });
        } else {
          setWidgetState(widgetId, { refreshing: false });
        }
      } catch (reason) {
        setWidgetState(widgetId, {
          error: reason instanceof Error ? reason.message : "Couldn't refresh.",
          refreshing: false,
        });
      }
    },
    [dashboardId, setWidgetState, widgetMap],
  );

  // §8b: staggered wave in reading order (top-left first).
  const readingOrder = useCallback(
    (ids: string[]): string[] => {
      const order = new Map(layout.map((item, index) => [item.i, item.y * 1000 + item.x + index * 0.001]));
      return [...ids].sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
    },
    [layout],
  );

  const refreshWave = useCallback(
    async (widgetIds: string[], nextRange: DashboardDateRange | null) => {
      const ordered = readingOrder(widgetIds);
      await Promise.all(
        ordered.map(
          (id, index) =>
            new Promise<void>((resolve) => {
              window.setTimeout(() => {
                void refreshOne(id, nextRange).finally(resolve);
              }, index * WAVE_STAGGER_MS);
            }),
        ),
      );
    },
    [readingOrder, refreshOne],
  );

  const refreshAll = useCallback(async () => {
    if (!canRefresh || refreshingAll) return;
    setRefreshingAll(true);
    try {
      await refreshWave(liveWidgets.map((w) => w.id), range);
    } finally {
      setRefreshingAll(false);
    }
  }, [canRefresh, liveWidgets, range, refreshWave, refreshingAll]);

  // §4.2: on load, refresh a live dashboard's widgets that are stale beyond the
  // window. (Snapshot dashboards never auto-refresh.)
  const didLoadRefresh = useRef(false);
  useEffect(() => {
    if (didLoadRefresh.current || !canRefresh || !isLive) return;
    didLoadRefresh.current = true;
    const windowMs = refreshIntervalSeconds ? refreshIntervalSeconds * 1000 : STALENESS_MS;
    const stale = liveWidgets
      .filter((w) => isStale(statesRef.current[w.id]?.lastRefreshedAt ?? null, windowMs))
      .map((w) => w.id);
    if (stale.length) void refreshWave(stale, range);
  }, [canRefresh, isLive, liveWidgets, range, refreshIntervalSeconds, refreshWave]);

  // §2: whole-dashboard mode toggle. Switching to live refreshes every widget in a
  // wave; switching to snapshot simply freezes (no execution).
  const changeMode = useCallback(
    (next: WidgetMode) => {
      if (next === mode) return;
      setMode(next);
      void dashboardsApi.updateSettings(dashboardId, { mode: next }).catch(() => undefined);
      if (next === "live") {
        didLoadRefresh.current = true; // this handler owns the refresh
        setRefreshingAll(true);
        void refreshWave(widgets.map((w) => w.id), range).finally(() => setRefreshingAll(false));
      }
    },
    [mode, dashboardId, refreshWave, widgets, range],
  );

  // §5: changing the global range refreshes bound widgets in a wave, and pulses
  // unbound widgets' borders to signal "intentionally unchanged."
  const changeRange = useCallback(
    (nextRange: DashboardDateRange | null) => {
      setRange(nextRange);
      void dashboardsApi.updateSettings(dashboardId, { defaultDateRange: nextRange }).catch(() => undefined);
      const bound = widgets.filter((w) => Boolean(w.filterBinding)).map((w) => w.id);
      const unaffected = widgets.filter((w) => !w.filterBinding).map((w) => w.id);
      setStates((prev) => {
        const next = { ...prev };
        for (const id of unaffected) if (next[id]) next[id] = { ...next[id], pulseKey: next[id].pulseKey + 1 };
        return next;
      });
      if (bound.length) void refreshWave(bound, nextRange);
    },
    [dashboardId, refreshWave, widgets],
  );

  // §4.2: optional auto-refresh, paused when the tab is hidden (live dashboards only).
  useEffect(() => {
    if (!canRefresh || !refreshIntervalSeconds || !isLive) return;
    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (timer) return;
      timer = setInterval(() => {
        if (document.visibilityState === "visible") void refreshAll();
      }, refreshIntervalSeconds * 1000);
    };
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };
    const onVisibility = () => (document.visibilityState === "visible" ? start() : stop());
    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [canRefresh, isLive, refreshIntervalSeconds, refreshAll]);

  /* --------------------------- layout persistence ------------------------ */

  const drainSaveQueue = useCallback(async () => {
    if (savingRef.current) return;
    savingRef.current = true;
    const scope = scopeRef.current;
    while (scope === scopeRef.current && pendingLayoutRef.current) {
      const nextLayout = pendingLayoutRef.current;
      pendingLayoutRef.current = null;
      setSaveState("saving");
      setSaveError(null);
      try {
        await dashboardsApi.updateWidgetLayouts(
          dashboardId,
          nextLayout.map((item) => ({
            id: item.i,
            layout: { schemaVersion: 1 as const, x: item.x, y: item.y, w: item.w, h: item.h },
          })),
        );
        if (scope !== scopeRef.current) break;
        confirmedLayoutRef.current = copyLayout(nextLayout);
        failedLayoutRef.current = null;
      } catch (reason) {
        if (scope === scopeRef.current) {
          failedLayoutRef.current = copyLayout(nextLayout);
          pendingLayoutRef.current = null;
          setLayout(copyLayout(confirmedLayoutRef.current));
          setSaveState("error");
          setSaveError(reason instanceof Error ? reason.message : "Unable to save the layout.");
        }
        break;
      }
    }
    savingRef.current = false;
    if (scope === scopeRef.current && !failedLayoutRef.current && !pendingLayoutRef.current) {
      setSaveState("saved");
      onLayoutSaved?.();
    }
  }, [dashboardId, onLayoutSaved]);

  const handleLayoutChange = useCallback(
    (newLayout: Layout) => {
      const nextLayout = copyLayout(newLayout);
      setLayout(nextLayout);
      pendingLayoutRef.current = nextLayout;
      failedLayoutRef.current = null;
      setSaveState("idle");
      setSaveError(null);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        debounceRef.current = null;
        void drainSaveQueue();
      }, 800);
    },
    [drainSaveQueue],
  );

  useEffect(() => {
    if (previousEditingRef.current && !isEditing && pendingLayoutRef.current) {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = null;
      queueMicrotask(() => void drainSaveQueue());
    }
    previousEditingRef.current = isEditing;
  }, [drainSaveQueue, isEditing]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      scopeRef.current += 1;
      pendingLayoutRef.current = null;
    };
  }, []);

  const retrySave = useCallback(() => {
    if (!failedLayoutRef.current) return;
    const retryLayout = copyLayout(failedLayoutRef.current);
    failedLayoutRef.current = null;
    pendingLayoutRef.current = retryLayout;
    setLayout(retryLayout);
    void drainSaveQueue();
  }, [drainSaveQueue]);

  const stableLayouts = useMemo(
    () => ({ lg: layout, md: layout, sm: layout, xs: layout, xxs: layout }),
    [layout],
  );

  const anyRefreshing = refreshingAll || Object.values(states).some((s) => s.refreshing);

  return (
    <div className="space-y-2">
      {/* SPEC-06 §2/§5/§6: dashboard-level mode toggle + (when live) the date range
          and Refresh all — a tight, left-aligned control row (no empty container). */}
      {canRefresh ? (
        <div className="flex flex-wrap items-center gap-2">
          <ModeToggle value={mode} onChange={changeMode} disabled={anyRefreshing} />
          {isLive && hasFilterBound ? (
            <DateRangePicker value={range} onChange={changeRange} disabled={anyRefreshing} />
          ) : null}
          {isLive ? (
            <Button type="button" variant="ghost" size="sm" onClick={() => void refreshAll()} disabled={anyRefreshing}>
              <RefreshCw className={cn("h-3.5 w-3.5", anyRefreshing && "qw-spin-once")} />
              {anyRefreshing ? "Refreshing…" : "Refresh all"}
            </Button>
          ) : null}
        </div>
      ) : null}

      {isEditing && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-accent-line bg-accent-soft px-4 py-2.5 text-[13px] text-muted">
          <div className="flex items-center gap-2">
            <LayoutGrid className="h-3.5 w-3.5 shrink-0 text-accent-strong" />
            <span>Drag to rearrange · resize from any edge — changes save on their own</span>
          </div>
          <div aria-live="polite" aria-atomic="true" className="font-mono text-[11px]">
            {saveState === "saving" ? (
              <span className="flex items-center gap-1.5 text-muted">
                <Spinner size="sm" /> saving…
              </span>
            ) : saveState === "saved" ? (
              <span className="flex items-center gap-1.5 text-accent-strong" style={{ animation: "qw-stamp 0.26s cubic-bezier(0.16,1,0.3,1) both" }}>
                <Check className="h-3.5 w-3.5" /> layout saved
              </span>
            ) : null}
          </div>
        </div>
      )}

      {saveState === "error" ? (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-danger/30 bg-danger/5 px-4 py-2 text-sm text-danger"
        >
          <span className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            Layout save failed; the last saved layout was restored.
            {saveError ? ` ${saveError}` : ""}
          </span>
          <Button type="button" size="sm" variant="ghost" onClick={retrySave}>
            <RotateCcw className="h-3.5 w-3.5" /> Retry
          </Button>
        </div>
      ) : null}

      <style>{`
        .react-resizable-handle { background: none; border: none; }
        .react-resizable-handle::after {
          content: ''; position: absolute; right: 4px; bottom: 4px; width: 8px; height: 8px;
          border-right: 2px solid var(--accent); border-bottom: 2px solid var(--accent);
          border-bottom-right-radius: 3px; opacity: 0.7;
        }
        .react-grid-placeholder { background: var(--accent-soft); border: 1.5px dashed var(--accent-line); border-radius: 12px; }
        .react-grid-item.react-draggable-dragging { z-index: 20; }
      `}</style>

      <div ref={containerRef}>
        {mounted && (
          <ResponsiveGridLayout
            width={width}
            layouts={stableLayouts}
            breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
            cols={{ lg: 12, md: 10, sm: 6, xs: 4, xxs: 2 }}
            rowHeight={80}
            margin={[12, 12]}
            dragConfig={{ enabled: isEditing }}
            resizeConfig={{ enabled: isEditing, handles: ["se", "sw", "ne", "nw", "e", "w", "n", "s"] }}
            onLayoutChange={isEditing ? (newLayout) => handleLayoutChange(newLayout) : undefined}
            compactor={verticalCompactor}
          >
            {layout.map((layoutItem) => {
              const widget = widgetMap.get(layoutItem.i);
              if (!widget) return null;
              const state = states[widget.id];
              if (!state) return null;
              const view: LiveWidgetView = {
                id: widget.id,
                title: widget.title,
                mode,
                chartConfig: widget.chartConfig,
                preview: isBoundedResultPreview(state.preview)
                  ? state.preview
                  : (widget.snapshot as BoundedResultPreview),
                lastRefreshedAt: state.lastRefreshedAt,
                error: state.error,
                refreshing: state.refreshing,
                filterBound: Boolean(widget.filterBinding),
                pulseKey: state.pulseKey,
              };
              return (
                <div key={widget.id}>
                  <LiveWidgetCard
                    view={view}
                    isEditing={isEditing}
                    removing={busyWidget === widget.id}
                    onRefresh={() => void refreshOne(widget.id, range)}
                    onRemove={onRemoveWidget ? () => onRemoveWidget(widget.id) : undefined}
                  />
                </div>
              );
            })}
          </ResponsiveGridLayout>
        )}
      </div>
    </div>
  );
}

export function EditLayoutButton({ isEditing, onToggle }: { isEditing: boolean; onToggle: () => void }) {
  if (isEditing) {
    return (
      <Button type="button" variant="primary" size="sm" onClick={onToggle}>
        <Check className="h-3.5 w-3.5" />
        Done editing
      </Button>
    );
  }
  return (
    <Button type="button" variant="ghost" size="sm" onClick={onToggle}>
      <LayoutGrid className="h-3.5 w-3.5" />
      Edit layout
    </Button>
  );
}
