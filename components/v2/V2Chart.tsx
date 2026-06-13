"use client";

import { ChartRenderer } from "@/components/charts/ChartRenderer";
import type { BoundedResultPreview, ChartConfig } from "@/types/v2";

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

export function V2Chart({ preview, config }: { preview: unknown; config: ChartConfig }) {
  if (!isBoundedResultPreview(preview)) {
    return (
      <p className="rounded-lg border border-dashed border-border p-4 text-xs text-text-3">
        No chart data is available for this response.
      </p>
    );
  }
  return (
    <ChartRenderer
      result={{
        columns: preview.columns.map((column) => column.name),
        rows: preview.rows,
        rowCount: preview.returnedRowCount,
        executionTimeMs: 0,
      }}
      chartConfig={{
        ...config,
        availableTypes: ["bar", "line", "pie", "scatter", "area", "table"],
      }}
    />
  );
}
