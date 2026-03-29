import type { ChartType } from "@/types";

export const CHART_TYPE_LABELS: Record<ChartType, string> = {
  bar: "Bar",
  line: "Line",
  pie: "Pie",
  scatter: "Scatter",
  area: "Area",
  table: "Table",
};

export function toChartTypeOptions(types: ChartType[]): { label: string; value: string }[] {
  return types.map((type) => ({
    label: CHART_TYPE_LABELS[type],
    value: type,
  }));
}

