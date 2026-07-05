"use client";

import { ChartRenderer } from "@/components/charts/ChartRenderer";
import type { QueryResult } from "@/types";
import type { BoundedResultPreview, ChartConfig } from "@query-wise/shared/types";

export function isBoundedResultPreview(preview: unknown): preview is BoundedResultPreview {
  if (!preview || typeof preview !== "object") return false;
  const value = preview as Partial<BoundedResultPreview>;
  return (
    Array.isArray(value.columns) &&
    value.columns.every(
      (column) =>
        column != null &&
        typeof column === "object" &&
        typeof (column as { name?: unknown }).name === "string",
    ) &&
    Array.isArray(value.rows) &&
    typeof value.returnedRowCount === "number"
  );
}

export function previewToQueryResult(preview: BoundedResultPreview): QueryResult {
  return {
    columns: preview.columns.map((column) => column.name),
    rows: preview.rows,
    rowCount: preview.returnedRowCount,
    executionTimeMs: 0,
  };
}

export function V2Chart({ preview, config }: { preview: unknown; config: ChartConfig }) {
  if (!isBoundedResultPreview(preview)) {
    return (
      <p className="rounded-lg border border-dashed border-border p-4 text-xs text-faint">
        No chart data is available for this response.
      </p>
    );
  }
  // ChartRenderer only switches on config.type; availableTypes is informational
  // (the type switcher is gated by data shape upstream in ResultBlockCard).
  return (
    <ChartRenderer
      result={previewToQueryResult(preview)}
      chartConfig={{ ...config, availableTypes: ["bar", "line", "pie", "scatter", "area", "table"] }}
    />
  );
}
