"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Check, LayoutGrid, RotateCcw, Trash2 } from "lucide-react";
import { ResponsiveGridLayout, useContainerWidth, verticalCompactor } from "react-grid-layout";
import type { Layout, LayoutItem } from "react-grid-layout";

import { V2Chart } from "@/components/v2/V2Chart";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { dashboardsApi } from "@/lib/v2/api-client";
import type { DashboardDto } from "@/lib/v2/api-client";

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
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-surface-2 px-4 py-2 text-sm text-text-3">
          <div className="flex items-center gap-2">
            <LayoutGrid className="h-3.5 w-3.5 shrink-0 text-accent-2" />
            <span>Drag widgets to rearrange · Resize from any edge or corner</span>
          </div>
          <div aria-live="polite" aria-atomic="true">
            {saveState === "saving" ? (
              <span className="flex items-center gap-1.5 text-text-2">
                <Spinner size="sm" /> Saving layout…
              </span>
            ) : saveState === "saved" ? (
              <span className="flex items-center gap-1.5 text-success">
                <Check className="h-3.5 w-3.5" /> Layout saved
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
          border-right: 2px solid var(--accent-2);
          border-bottom: 2px solid var(--accent-2);
        }
        .react-grid-placeholder {
          background: var(--accent-2);
          opacity: 0.1;
          border: 2px dashed var(--accent-2);
          border-radius: 8px;
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
              return (
                <div key={widget.id}>
                  <Card className="flex h-full flex-col overflow-hidden">
                    <div
                      className={cn(
                        "flex items-center justify-between gap-3 border-b border-border px-4 py-3",
                        isEditing && "cursor-grab active:cursor-grabbing",
                      )}
                    >
                      <h2 className="truncate font-medium">{widget.title}</h2>
                      {isEditing && onRemoveWidget ? (
                        <Button
                          size="sm"
                          variant="danger"
                          loading={busyWidget === widget.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            onRemoveWidget(widget.id);
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Remove
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
