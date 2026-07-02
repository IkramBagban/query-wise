import type { ChartType } from "@/types";

export type AxisColumnKind = "numeric" | "temporal" | "categorical";

export function getColumnKind(
  rows: Record<string, unknown>[],
  column: string,
): AxisColumnKind {
  const sample = rows.find((row) => row[column] != null)?.[column];

  if (typeof sample === "number") return "numeric";

  if (sample instanceof Date && !Number.isNaN(sample.getTime())) {
    return "temporal";
  }

  if (typeof sample === "string") {
    const trimmed = sample.trim();
    if (trimmed.length >= 8) {
      const ts = Date.parse(trimmed);
      if (!Number.isNaN(ts)) return "temporal";
    }
  }

  return "categorical";
}

export function validateAxisSemantics(
  type: ChartType,
  rows: Record<string, unknown>[],
  config: {
    xKey?: string;
    yKey?: string;
    yKeys?: string[];
    nameKey?: string;
    valueKey?: string;
  },
): boolean {
  if (type === "table") return true;

  const kinds = new Map<string, AxisColumnKind>();
  const getKind = (key: string) => {
    if (!kinds.has(key)) kinds.set(key, getColumnKind(rows, key));
    return kinds.get(key)!;
  };

  if (type === "pie") {
    if (!config.nameKey || !config.valueKey) return false;
    const nameKind = getKind(config.nameKey);
    const valueKind = getKind(config.valueKey);
    if (nameKind !== "categorical" && nameKind !== "temporal") return false;
    if (valueKind !== "numeric") return false;
    
    // low-cardinality nameKey (≤12 rows)
    const distinctNames = new Set(rows.map((r) => String(r[config.nameKey!])));
    if (distinctNames.size > 12) return false;
    
    return true;
  }

  const measures = [config.yKey, ...(config.yKeys ?? [])].filter(
    (key): key is string => Boolean(key),
  );
  if (measures.length === 0) return false;
  for (const key of measures) {
    if (getKind(key) !== "numeric") return false;
  }

  if (!config.xKey) return false;
  const xKind = getKind(config.xKey);

  if (type === "scatter") {
    if (xKind !== "numeric" && xKind !== "temporal") return false;
  } else {
    // bar, line, area
    if (xKind !== "categorical" && xKind !== "temporal") return false;
  }

  return true;
}
