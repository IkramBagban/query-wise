"use client";

import { ChartRenderer } from "@/components/charts/ChartRenderer";
import type { BoundedResultPreview, ChartConfig } from "@/types/v2";

export function V2Chart({ preview, config }: { preview: BoundedResultPreview; config: ChartConfig }) {
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
