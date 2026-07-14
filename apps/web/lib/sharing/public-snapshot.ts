import type { DashboardWidget } from "@prisma/client";
import type { BoundedResultPreview, PublicDashboardDto } from "@query-wise/shared/types";
// Import the pure zod schemas directly (not the @/lib/dashboards barrel, which
// pulls server-only service code) so this stays unit-testable without a server env.
import { ChartConfigSchema, WidgetLayoutSchema } from "@/lib/dashboards/schemas";

type PublicWidget = PublicDashboardDto["dashboard"]["widgets"][number];

/**
 * SPEC-13: snapshot-mode public serving. Serve each widget's persisted `snapshot`
 * column directly — no SQL execution, no credential fetch, no result-cache
 * involvement. This is the branch that keeps a shared link working forever even
 * after the underlying connection is deleted, and it never leaks live data.
 */
export function snapshotPublicWidget(widget: DashboardWidget): PublicWidget {
  const chartConfig = ChartConfigSchema.parse(widget.chartConfig);
  const layout = WidgetLayoutSchema.parse(widget.layout);
  return {
    id: widget.id,
    title: widget.title,
    chartConfig,
    layout,
    viewTransform: widget.viewTransform as unknown as PublicWidget["viewTransform"],
    result: widget.snapshot as unknown as BoundedResultPreview,
    error: null,
  };
}

export function snapshotPublicWidgets(widgets: DashboardWidget[]): PublicWidget[] {
  return widgets.map(snapshotPublicWidget);
}
