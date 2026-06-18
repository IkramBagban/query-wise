"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { GripVertical, Lock, LockOpen, MoveDiagonal2, Trash2 } from "lucide-react";

import { V2Chart } from "@/components/v2/V2Chart";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { DashboardDto } from "@/lib/v2/api-client";
import type { WidgetLayout } from "@/types/v2";

const DESKTOP_COLUMNS = 12;
const ROW_HEIGHT = 80;
const GRID_GAP = 16;
const MIN_WIDGET_WIDTH = 3;
const MIN_WIDGET_HEIGHT = 3;

type DashboardWidget = DashboardDto["widgets"][number];

interface DashboardGridProps {
  widgets: DashboardWidget[];
  editable?: boolean;
  busyWidget?: string | null;
  onRemoveWidget?: (widgetId: string) => void;
  onPersistLayouts?: (
    widgets: Array<{ id: string; layout: WidgetLayout }>,
  ) => Promise<void>;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function sortedWidgets(widgets: DashboardWidget[]) {
  return [...widgets].sort((left, right) => {
    const yDiff = left.layout.y - right.layout.y;
    if (yDiff !== 0) return yDiff;
    const xDiff = left.layout.x - right.layout.x;
    if (xDiff !== 0) return xDiff;
    return left.createdAt.localeCompare(right.createdAt);
  });
}

function packLayouts(widgets: DashboardWidget[]) {
  let cursorX = 0;
  let cursorY = 0;
  let rowHeight = 0;

  return widgets.map((widget) => {
    const width = clamp(widget.layout.w, MIN_WIDGET_WIDTH, DESKTOP_COLUMNS);
    const height = Math.max(MIN_WIDGET_HEIGHT, widget.layout.h);
    if (cursorX + width > DESKTOP_COLUMNS) {
      cursorX = 0;
      cursorY += rowHeight;
      rowHeight = 0;
    }

    const layout = {
      ...widget.layout,
      x: cursorX,
      y: cursorY,
      w: width,
      h: height,
    };
    cursorX += width;
    rowHeight = Math.max(rowHeight, height);
    return { ...widget, layout };
  });
}

export function DashboardGrid({
  widgets,
  editable = false,
  busyWidget = null,
  onRemoveWidget,
  onPersistLayouts,
}: DashboardGridProps) {
  const gridRef = useRef<HTMLDivElement | null>(null);
  const [draftWidgets, setDraftWidgets] = useState(() => sortedWidgets(widgets));
  const [draggedWidgetId, setDraggedWidgetId] = useState<string | null>(null);
  const [locked, setLocked] = useState(!editable);
  const [saving, setSaving] = useState(false);
  const canEditLayout = editable && !locked && !saving;

  useEffect(() => {
    setDraftWidgets(sortedWidgets(widgets));
  }, [widgets]);

  useEffect(() => {
    setLocked(!editable);
  }, [editable]);

  const orderedWidgets = useMemo(
    () => (editable ? draftWidgets : sortedWidgets(widgets)),
    [draftWidgets, editable, widgets],
  );

  async function persistLayouts(
    nextWidgets: DashboardWidget[],
    rollbackWidgets?: DashboardWidget[],
  ) {
    if (!onPersistLayouts) return;
    setSaving(true);
    try {
      await onPersistLayouts(
        nextWidgets.map((widget) => ({
          id: widget.id,
          layout: widget.layout,
        })),
      );
    } catch {
      if (rollbackWidgets) setDraftWidgets(rollbackWidgets);
    } finally {
      setSaving(false);
    }
  }

  function moveWidget(targetWidgetId: string) {
    if (!draggedWidgetId || draggedWidgetId === targetWidgetId || !canEditLayout) return;
    const current = [...draftWidgets];
    const fromIndex = current.findIndex((widget) => widget.id === draggedWidgetId);
    const toIndex = current.findIndex((widget) => widget.id === targetWidgetId);
    if (fromIndex === -1 || toIndex === -1) return;
    const [dragged] = current.splice(fromIndex, 1);
    current.splice(toIndex, 0, dragged);
    const nextWidgets = packLayouts(current);
    setDraftWidgets(nextWidgets);
    void persistLayouts(nextWidgets, draftWidgets);
  }

  function startResize(widgetId: string, event: React.PointerEvent<HTMLButtonElement>) {
    if (!canEditLayout) return;
    event.preventDefault();
    const grid = gridRef.current;
    const widget = draftWidgets.find((item) => item.id === widgetId);
    if (!grid || !widget) return;

    const columnWidth = (grid.clientWidth - GRID_GAP * (DESKTOP_COLUMNS - 1)) / DESKTOP_COLUMNS;
    const startX = event.clientX;
    const startY = event.clientY;
    const startLayout = widget.layout;
    const pointerId = event.pointerId;
    event.currentTarget.setPointerCapture(pointerId);

    const onMove = (moveEvent: PointerEvent) => {
      const deltaColumns = Math.round((moveEvent.clientX - startX) / columnWidth);
      const deltaRows = Math.round((moveEvent.clientY - startY) / ROW_HEIGHT);
      setDraftWidgets((current) =>
        current.map((item) =>
          item.id === widgetId
            ? {
                ...item,
                layout: {
                  ...item.layout,
                  w: clamp(startLayout.w + deltaColumns, MIN_WIDGET_WIDTH, DESKTOP_COLUMNS),
                  h: clamp(startLayout.h + deltaRows, MIN_WIDGET_HEIGHT, 20),
                },
              }
            : item,
        ),
      );
    };

    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      setDraftWidgets((current) => {
        const nextWidgets = packLayouts(current);
        void persistLayouts(nextWidgets, sortedWidgets(widgets));
        return nextWidgets;
      });
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
  }

  return (
    <div className="space-y-3">
      {editable ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface px-3 py-2">
          <div>
            <p className="text-sm font-medium">Layout controls</p>
            <p className="text-xs text-text-3">
              {locked
                ? "Locked. Unlock to rearrange widgets."
                : "Drag handles move widgets; corner handles resize them."}
            </p>
          </div>
          <Button
            type="button"
            variant={locked ? "ghost" : "primary"}
            size="sm"
            onClick={() => setLocked((value) => !value)}
            disabled={saving}
          >
            {locked ? <Lock className="h-4 w-4" /> : <LockOpen className="h-4 w-4" />}
            {locked ? "Unlock layout" : "Lock layout"}
          </Button>
        </div>
      ) : null}
      <div
        ref={gridRef}
        className="grid grid-cols-1 gap-4 md:grid-cols-6 xl:grid-cols-12"
        style={{ gridAutoRows: `${ROW_HEIGHT}px` }}
      >
        {orderedWidgets.map((widget) => (
          <Card
            key={widget.id}
            className={cn(
              "dashboard-grid-card",
              "relative flex min-h-0 flex-col overflow-hidden",
              draggedWidgetId === widget.id && "opacity-60",
            )}
            style={{
              "--dashboard-col-span": clamp(widget.layout.w, 1, DESKTOP_COLUMNS),
              "--dashboard-md-col-span": clamp(widget.layout.w, 1, 6),
              "--dashboard-row-span": Math.max(MIN_WIDGET_HEIGHT, widget.layout.h),
            } as CSSProperties}
            onDragOver={(event) => {
              if (canEditLayout) event.preventDefault();
            }}
            onDrop={() => moveWidget(widget.id)}
          >
            <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
              <div className="flex min-w-0 items-start gap-2">
                {editable ? (
                  <button
                    type="button"
                    draggable={canEditLayout}
                    onDragStart={() => setDraggedWidgetId(widget.id)}
                    onDragEnd={() => setDraggedWidgetId(null)}
                    className={cn(
                      "mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border text-text-3 transition hover:border-border-2 hover:text-text-1",
                      !canEditLayout && "cursor-not-allowed opacity-50",
                    )}
                    aria-label={`Drag ${widget.title}`}
                    title={locked ? "Unlock layout to drag" : "Drag to move"}
                  >
                    <GripVertical className="h-4 w-4" />
                  </button>
                ) : null}
                <div className="min-w-0">
                  <h2 className="truncate font-medium">{widget.title}</h2>
                  {editable ? (
                    <p className="text-xs text-text-3">
                      {widget.layout.w} columns x {widget.layout.h} rows
                    </p>
                  ) : null}
                </div>
              </div>
              {editable && onRemoveWidget ? (
                <Button
                  size="sm"
                  variant="danger"
                  loading={busyWidget === widget.id}
                  onClick={() => onRemoveWidget(widget.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Remove
                </Button>
              ) : null}
            </div>
            <div className="min-h-0 flex-1 p-3">
              <V2Chart preview={widget.snapshot} config={widget.chartConfig} />
            </div>
            {editable ? (
              <button
                type="button"
                onPointerDown={(event) => startResize(widget.id, event)}
                className={cn(
                  "absolute bottom-2 right-2 inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-surface/95 text-text-3 shadow-sm transition hover:border-border-2 hover:text-text-1",
                  !canEditLayout && "cursor-not-allowed opacity-50",
                )}
                aria-label={`Resize ${widget.title}`}
                title={locked ? "Unlock layout to resize" : "Resize"}
              >
                <MoveDiagonal2 className="h-4 w-4" />
              </button>
            ) : null}
          </Card>
        ))}
      </div>
    </div>
  );
}
