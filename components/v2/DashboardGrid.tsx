"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, LayoutGrid, Trash2 } from "lucide-react";
import { ResponsiveGridLayout, useContainerWidth, verticalCompactor } from "react-grid-layout";
import type { Layout, LayoutItem } from "react-grid-layout";

import { V2Chart } from "@/components/v2/V2Chart";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { dashboardsApi } from "@/lib/v2/api-client";
import type { DashboardDto } from "@/lib/v2/api-client";

import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";

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
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setLayout(widgetsToLayout(widgets));
  }, [widgets]);

  const handleLayoutChange = useCallback(
    (newLayout: Layout) => {
      setLayout(newLayout);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        void dashboardsApi
          .updateWidgetLayouts(
            dashboardId,
            newLayout.map((l) => ({
              id: l.i,
              layout: { schemaVersion: 1 as const, x: l.x, y: l.y, w: l.w, h: l.h },
            })),
          )
          .then(() => {
            onLayoutSaved?.();
          });
      }, 800);
    },
    [dashboardId, onLayoutSaved],
  );

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const widgetMap = new Map(widgets.map((w) => [w.id, w]));

  return (
    <div className="space-y-2">
      {isEditing && (
        <div className="flex items-center gap-2 rounded-lg border border-border bg-surface-2 px-4 py-2 text-sm text-text-3">
          <LayoutGrid className="h-3.5 w-3.5 shrink-0 text-accent-2" />
          <span>Drag widgets to rearrange · Resize from any edge or corner</span>
        </div>
      )}

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
            layouts={{
              lg: layout,
              md: layout,
              sm: layout,
              xs: layout,
              xxs: layout,
            }}
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
                    <div className="min-h-0 flex-1 p-3">
                      <V2Chart preview={widget.snapshot} config={widget.chartConfig} />
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
