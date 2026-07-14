"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Check, RefreshCw, RotateCcw } from "lucide-react";
import { ResponsiveGridLayout, useContainerWidth, verticalCompactor } from "react-grid-layout";
import type { Layout, LayoutItem } from "react-grid-layout";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { dashboardsApi } from "@/lib/api-client";
import type { DashboardDto } from "@/lib/api-client";
import type { BoundedResultPreview, WidgetMode } from "@query-wise/shared/types";
import { isBoundedResultPreview } from "@/components/V2Chart";
import { ModeToggle } from "@/components/dashboard/primitives";
import { LiveWidgetCard, type LiveWidgetView } from "@/components/dashboard/LiveWidgetCard";
// Click-to-drill / "Ask about this" (SPEC-06 §7) removed per product decision.
// import { DrillDrawer, type DrillTarget } from "@/components/dashboard/DrillDrawer";

type DashboardWidget = DashboardDto["widgets"][number];

const STALENESS_MS = 10 * 60 * 1000; // §4.2 default staleness window
const WAVE_STAGGER_MS = 60; // §8b staggered refresh wave

export interface DashboardGridProps {
  widgets: DashboardWidget[];
  dashboardId: string;
  canEdit: boolean;
  onLayoutSaved?: () => void;
  busyWidget?: string | null;
  onRemoveWidget?: (widgetId: string) => void;
  onRenameWidget?: (widgetId: string, title: string) => Promise<void> | void;
  canRefresh?: boolean;
  mode?: WidgetMode;
  refreshIntervalSeconds?: number | null;
  // SPEC-13 §5: a widget's connection was deleted — freeze refresh, show last values.
  connectionDeleted?: boolean;
}

export function WidgetCardSkeleton() {
  const barHeights = ["h-[38%]", "h-[56%]", "h-[44%]", "h-[74%]", "h-[62%]", "h-[88%]", "h-[51%]", "h-[68%]"];

  return (
    <Card className="flex min-h-72 flex-col overflow-hidden rounded-2xl border-border/70">
      <div className="flex items-center justify-between px-4 pb-2 pt-3">
        <div className="flex items-center gap-2"><Skeleton className="h-4 w-36" /><Skeleton className="size-3.5 rounded-full" /></div>
        <Skeleton className="size-6 rounded-md" />
      </div>

      <div className="relative mx-4 mb-4 min-h-52 flex-1 overflow-hidden rounded-lg" aria-hidden="true">
        <div className="absolute inset-x-0 top-3 space-y-8 opacity-75">
          {["grid-1", "grid-2", "grid-3", "grid-4"].map((key) => <div key={key} className="h-px bg-border" />)}
        </div>
        <div className="absolute inset-x-4 bottom-6 top-5 flex items-end justify-between gap-2">
          {barHeights.map((height, index) => (
            <Skeleton
              key={index}
              className={`w-full max-w-9 rounded-t-sm rounded-b-none ${height}`}
            />
          ))}
        </div>
        <div className="absolute inset-x-0 bottom-0 flex justify-between">
          {["axis-1", "axis-2", "axis-3", "axis-4"].map((key) => <Skeleton key={key} className="h-2 w-7" />)}
        </div>
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
}

function initialStates(widgets: DashboardWidget[]): Record<string, WidgetState> {
  const map: Record<string, WidgetState> = {};
  for (const widget of widgets) {
    map[widget.id] = {
      preview: widget.snapshot as BoundedResultPreview,
      lastRefreshedAt: widget.lastRefreshedAt ?? null,
      error: widget.lastRefreshError ?? null,
      refreshing: false,
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
  canEdit,
  onLayoutSaved,
  busyWidget = null,
  onRemoveWidget,
  onRenameWidget,
  canRefresh = false,
  mode: modeProp = "live",
  refreshIntervalSeconds = null,
  connectionDeleted = false,
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
  const previousEditingRef = useRef(canEdit);

  /* ---------------------------- live state ------------------------------- */

  const [states, setStates] = useState<Record<string, WidgetState>>(() => initialStates(widgets));
  const [mode, setMode] = useState<WidgetMode>(modeProp);
  const [refreshingAll, setRefreshingAll] = useState(false);
  const statesRef = useRef(states);
  statesRef.current = states;

  const isLive = mode === "live";
  const widgetMap = useMemo(() => new Map(widgets.map((w) => [w.id, w])), [widgets]);
  // Whole-dashboard mode: every widget is live iff the dashboard is live.
  const liveWidgets = useMemo(() => (isLive ? widgets : []), [isLive, widgets]);

  const setWidgetState = useCallback((id: string, patch: Partial<WidgetState>) => {
    setStates((prev) => (prev[id] ? { ...prev, [id]: { ...prev[id], ...patch } } : prev));
  }, []);

  const refreshOne = useCallback(
    async (widgetId: string) => {
      const widget = widgetMap.get(widgetId);
      if (!widget || connectionDeleted) return;
      setWidgetState(widgetId, { refreshing: true });
      try {
        const result = await dashboardsApi.refreshWidget(dashboardId, widgetId, {
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
    [dashboardId, setWidgetState, widgetMap, connectionDeleted],
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
    async (widgetIds: string[]) => {
      const ordered = readingOrder(widgetIds);
      await Promise.all(
        ordered.map(
          (id, index) =>
            new Promise<void>((resolve) => {
              window.setTimeout(() => {
                void refreshOne(id).finally(resolve);
              }, index * WAVE_STAGGER_MS);
            }),
        ),
      );
    },
    [readingOrder, refreshOne],
  );

  const refreshAll = useCallback(async () => {
    // SPEC-13 §5: a deleted data source can never refresh — freeze at last values.
    if (!canRefresh || refreshingAll || connectionDeleted) return;
    setRefreshingAll(true);
    try {
      await refreshWave(liveWidgets.map((w) => w.id));
    } finally {
      setRefreshingAll(false);
    }
  }, [canRefresh, liveWidgets, refreshWave, refreshingAll, connectionDeleted]);

  // §4.2: on load, refresh a live dashboard's widgets that are stale beyond the
  // window. (Snapshot dashboards never auto-refresh.)
  const didLoadRefresh = useRef(false);
  useEffect(() => {
    if (didLoadRefresh.current || !canRefresh || !isLive || connectionDeleted) return;
    didLoadRefresh.current = true;
    const windowMs = refreshIntervalSeconds ? refreshIntervalSeconds * 1000 : STALENESS_MS;
    const stale = liveWidgets
      .filter((w) => isStale(statesRef.current[w.id]?.lastRefreshedAt ?? null, windowMs))
      .map((w) => w.id);
    if (stale.length) void refreshWave(stale);
  }, [canRefresh, isLive, liveWidgets, refreshIntervalSeconds, refreshWave, connectionDeleted]);

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
        void refreshWave(widgets.map((w) => w.id)).finally(() => setRefreshingAll(false));
      }
    },
    [mode, dashboardId, refreshWave, widgets],
  );

  // §4.2: optional auto-refresh, paused when the tab is hidden (live dashboards only).
  useEffect(() => {
    if (!canRefresh || !refreshIntervalSeconds || !isLive || connectionDeleted) return;
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
  }, [canRefresh, isLive, refreshIntervalSeconds, refreshAll, connectionDeleted]);

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
    if (previousEditingRef.current && !canEdit && pendingLayoutRef.current) {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = null;
      queueMicrotask(() => void drainSaveQueue());
    }
    previousEditingRef.current = canEdit;
  }, [drainSaveQueue, canEdit]);

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
    <div className="space-y-3">
      {canRefresh ? (
        <div className="flex flex-wrap items-center gap-3 border-b border-border pb-3">
          <div className="flex flex-wrap items-center gap-2">
            <ModeToggle value={mode} onChange={changeMode} disabled={anyRefreshing || connectionDeleted} />
            {connectionDeleted ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-warning/40 bg-warning/10 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.1em] text-warning">
                <AlertCircle className="size-3" strokeWidth={2} />
                Data source removed — showing last known values
              </span>
            ) : null}
          </div>

          <div className="ml-auto flex items-center gap-2">
            {canEdit ? (
              <span aria-live="polite" aria-atomic="true" className="text-xs font-medium text-muted">
                {saveState === "saving" ? (
                  <span className="flex items-center gap-1.5"><Spinner size="sm" />Saving layout</span>
                ) : saveState === "saved" ? (
                  <span className="flex items-center gap-1.5 text-accent-strong" style={{ animation: "qw-stamp 0.26s cubic-bezier(0.16,1,0.3,1) both" }}>
                    <Check className="h-3.5 w-3.5" strokeWidth={2.5} />Saved
                  </span>
                ) : null}
              </span>
            ) : null}
            {isLive ? (
              <button
                type="button"
                onClick={() => void refreshAll()}
                disabled={anyRefreshing || connectionDeleted}
                title={connectionDeleted ? "The data source was removed — widgets show their last known values." : undefined}
                className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium text-muted transition-colors hover:bg-surface-2 hover:text-text disabled:cursor-not-allowed disabled:opacity-60"
              >
                <RefreshCw className={cn("h-3.5 w-3.5", anyRefreshing && "qw-spin-once")} />
                {anyRefreshing ? "Refreshing" : "Refresh data"}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

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
            dragConfig={{ enabled: canEdit, handle: ".qw-drag-handle", cancel: ".qw-no-drag" }}
            resizeConfig={{ enabled: canEdit, handles: ["se", "sw", "ne", "nw", "e", "w", "n", "s"] }}
            onLayoutChange={canEdit ? (newLayout) => handleLayoutChange(newLayout) : undefined}
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
                viewTransform: widget.viewTransform ?? null,
                preview: isBoundedResultPreview(state.preview)
                  ? state.preview
                  : (widget.snapshot as BoundedResultPreview),
                error: state.error,
                refreshing: state.refreshing,
              };
              return (
                <div key={widget.id}>
                  <LiveWidgetCard
                    view={view}
                    canEdit={canEdit}
                    removing={busyWidget === widget.id}
                    onRefresh={() => void refreshOne(widget.id)}
                    onRemove={onRemoveWidget ? () => onRemoveWidget(widget.id) : undefined}
                    onRename={onRenameWidget ? (title) => onRenameWidget(widget.id, title) : undefined}
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
