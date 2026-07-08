"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Check, GripVertical, LayoutGrid, RotateCcw, Trash2 } from "lucide-react";
import { ResponsiveGridLayout, useContainerWidth, verticalCompactor } from "react-grid-layout";
import type { Layout, LayoutItem } from "react-grid-layout";

import { V2Chart } from "@/components/V2Chart";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { dashboardsApi } from "@/lib/api-client";
import type { DashboardDto } from "@/lib/api-client";

type DashboardWidget = DashboardDto["widgets"][number];

export interface DashboardGridProps {
  widgets: DashboardWidget[];
  dashboardId: string;
  isEditing: boolean;
  onLayoutSaved?: () => void;
  busyWidget?: string | null;
  onRemoveWidget?: (widgetId: string) => void;
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
    (w): LayoutItem => ({
      i: w.id,
      x: w.layout.x,
      y: w.layout.y,
      w: w.layout.w,
      h: w.layout.h,
      minW: 2,
      minH: 3,
    }),
  );
}

function copyLayout(layout: Layout): Layout {
  return layout.map((item) => ({ ...item }));
}

export function DashboardGrid({
  widgets,
  dashboardId,
  isEditing,
  onLayoutSaved,
  busyWidget = null,
  onRemoveWidget,
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

  const drainSaveQueue = useCallback(async () => {
    if (savingRef.current) return;
    savingRef.current = true;
    const scope = scopeRef.current;

    // Serialize writes and consume the latest queued layout so an older response cannot win.
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
            layout: {
              schemaVersion: 1 as const,
              x: item.x,
              y: item.y,
              w: item.w,
              h: item.h,
            },
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

  const widgetMap = useMemo(() => new Map(widgets.map((w) => [w.id, w])), [widgets]);

  const stableLayouts = useMemo(
    () => ({ lg: layout, md: layout, sm: layout, xs: layout, xxs: layout }),
    [layout],
  );

  return (
    <div className="space-y-2">
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
        .react-resizable-handle {
          background: none;
          border: none;
        }
        .react-resizable-handle::after {
          content: '';
          position: absolute;
          right: 4px;
          bottom: 4px;
          width: 8px;
          height: 8px;
          border-right: 2px solid var(--accent);
          border-bottom: 2px solid var(--accent);
          border-bottom-right-radius: 3px;
          opacity: 0.7;
        }
        .react-grid-placeholder {
          background: var(--accent-soft);
          border: 1.5px dashed var(--accent-line);
          border-radius: 12px;
        }
        .react-grid-item.react-draggable-dragging {
          z-index: 20;
        }
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
            resizeConfig={{
              enabled: isEditing,
              handles: ["se", "sw", "ne", "nw", "e", "w", "n", "s"],
            }}
            onLayoutChange={isEditing ? (newLayout) => handleLayoutChange(newLayout) : undefined}
            compactor={verticalCompactor}
          >
            {layout.map((layoutItem) => {
              const widget = widgetMap.get(layoutItem.i);
              if (!widget) return null;
              const rows = widget.snapshot?.returnedRowCount;
              return (
                <div key={widget.id}>
                  <Card
                    className={cn(
                      "group/widget flex h-full flex-col overflow-hidden rounded-xl transition-all duration-200",
                      isEditing
                        ? "border-accent-line shadow-[0_0_0_3px_var(--accent-soft)]"
                        : "hover:border-border-2",
                    )}
                  >
                    <div
                      className={cn(
                        "flex shrink-0 items-center gap-2 border-b border-border bg-surface-2/50 px-3.5 py-2.5",
                        isEditing && "cursor-grab active:cursor-grabbing",
                      )}
                    >
                      {isEditing ? (
                        <GripVertical className="size-3.5 shrink-0 text-faint" strokeWidth={1.75} aria-hidden />
                      ) : null}
                      <h2 className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-text">{widget.title}</h2>
                      {typeof rows === "number" ? (
                        <span className="hidden shrink-0 whitespace-nowrap rounded-full border border-border bg-surface px-2 py-0.5 font-mono text-[10px] text-faint sm:block">
                          {rows} {rows === 1 ? "row" : "rows"}
                        </span>
                      ) : null}
                      {isEditing && onRemoveWidget ? (
                        <Button
                          size="sm"
                          variant="danger"
                          aria-label={`Remove ${widget.title}`}
                          className="h-7 w-7 shrink-0 p-0"
                          loading={busyWidget === widget.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            onRemoveWidget(widget.id);
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      ) : null}
                    </div>
                    <div className="min-h-0 flex-1 overflow-hidden p-3">
                      <div className="h-full w-full">
                        <V2Chart preview={widget.snapshot} config={widget.chartConfig} />
                      </div>
                    </div>
                  </Card>
                </div>
              );
            })}
          </ResponsiveGridLayout>
        )}
      </div>
    </div>
  );
}

export function EditLayoutButton({
  isEditing,
  onToggle,
}: {
  isEditing: boolean;
  onToggle: () => void;
}) {
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
