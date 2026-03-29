import { isDateColumn, isNumericColumn } from "@/lib/utils";
import type { ChartConfig, ChartHint, ChartType, QueryResult } from "@/types";

function inferColumnType(rows: Record<string, unknown>[], column: string): string {
  const value = rows.find((row) => row[column] != null)?.[column];
  if (value instanceof Date) return "timestamp";
  if (typeof value === "number") return "numeric";
  if (typeof value === "string") {
    if (!Number.isNaN(Date.parse(value)) && value.length > 8) return "timestamp";
    if (!Number.isNaN(Number(value))) return "numeric";
  }
  return "text";
}

function makeConfig(
  type: ChartType,
  overrides: Partial<ChartConfig>,
): ChartConfig {
  return {
    type,
    availableTypes: ["bar", "line", "pie", "scatter", "area", "table"],
    title: undefined,
    ...overrides,
  };
}

export function detectChartConfig(result: QueryResult): ChartConfig {
  const { columns, rows } = result;
  if (rows.length === 0 || columns.length === 0) {
    return makeConfig("table", { availableTypes: ["table"] });
  }

  if (columns.length === 1 && rows.length === 1) {
    return makeConfig("table", { availableTypes: ["table"] });
  }

  const firstCol = columns[0];
  const secondCol = columns[1];

  const dateCol = columns.find((col) => {
    const inferredType = inferColumnType(rows, col);
    return isDateColumn(col, inferredType);
  });

  if (dateCol && secondCol) {
    const numericCol = columns.find((col) => {
      if (col === dateCol) return false;
      return isNumericColumn(inferColumnType(rows, col));
    });
    return makeConfig("line", {
      xKey: dateCol,
      yKey: numericCol ?? secondCol,
      availableTypes: ["line", "bar", "area", "scatter", "table"],
    });
  }

  if (columns.length === 2 && secondCol) {
    const secondIsNumeric = isNumericColumn(inferColumnType(rows, secondCol));
    if (secondIsNumeric) {
      if (rows.length <= 8) {
        return makeConfig("pie", {
          nameKey: firstCol,
          valueKey: secondCol,
          availableTypes: ["pie", "bar", "line", "area", "scatter", "table"],
        });
      }
      return makeConfig("bar", {
        xKey: firstCol,
        yKey: secondCol,
        yKeys: [secondCol],
        availableTypes: ["bar", "line", "area", "scatter", "pie", "table"],
      });
    }
  }

  const numericCols = columns
    .slice(1)
    .filter((col) => isNumericColumn(inferColumnType(rows, col)));

  if (numericCols.length >= 2) {
    return makeConfig("bar", {
      xKey: firstCol,
      yKey: numericCols[0],
      yKeys: numericCols,
      availableTypes: ["bar", "line", "area", "scatter", "pie", "table"],
    });
  }

  return makeConfig("table", { availableTypes: ["table", "bar", "line", "area", "scatter", "pie"] });
}

function isNumericResultColumn(rows: Record<string, unknown>[], column: string): boolean {
  return rows.some((row) => isNumericColumn(inferColumnType([row], column)));
}

function applyChartHint(base: ChartConfig, result: QueryResult, hint?: ChartHint | null): ChartConfig {
  if (!hint?.type) return base;

  const { columns, rows } = result;
  const columnSet = new Set(columns);

  const hasColumn = (key?: string): key is string => Boolean(key && columnSet.has(key));
  const numericKeys = (hint.yKeys ?? [])
    .filter((key) => hasColumn(key) && isNumericResultColumn(rows, key));

  if (hint.type === "pie") {
    if (!hasColumn(hint.nameKey) || !hasColumn(hint.valueKey)) return base;
    if (!isNumericResultColumn(rows, hint.valueKey)) return base;
    return makeConfig("pie", {
      nameKey: hint.nameKey,
      valueKey: hint.valueKey,
      availableTypes: ["pie", "bar", "line", "area", "scatter", "table"],
    });
  }

  if (hint.type === "table") {
    return makeConfig("table", { availableTypes: ["table", "bar", "line", "area", "scatter", "pie"] });
  }

  if (!hasColumn(hint.xKey)) return base;
  const chosenYKeys = numericKeys.length > 0 ? numericKeys : undefined;
  const chosenYKey =
    (hasColumn(hint.yKey) && isNumericResultColumn(rows, hint.yKey) && hint.yKey) ||
    chosenYKeys?.[0];

  if (!chosenYKey) return base;

  return makeConfig(hint.type, {
    xKey: hint.xKey,
    yKey: chosenYKey,
    yKeys: chosenYKeys ?? [chosenYKey],
    availableTypes: ["bar", "line", "area", "scatter", "pie", "table"],
  });
}

export function resolveChartConfig(result: QueryResult, hint?: ChartHint | null): ChartConfig {
  const base = detectChartConfig(result);
  const resolved = applyChartHint(base, result, hint);

  const withFallbackType = resolved.availableTypes.includes(resolved.type)
    ? resolved
    : {
      ...resolved,
      availableTypes: [resolved.type, ...resolved.availableTypes],
    };

  if (
    (withFallbackType.type === "bar" ||
      withFallbackType.type === "line" ||
      withFallbackType.type === "area" ||
      withFallbackType.type === "scatter") &&
    withFallbackType.yKeys &&
    withFallbackType.yKeys.length > 1
  ) {
    return withFallbackType;
  }

  if (withFallbackType.yKey && (!withFallbackType.yKeys || withFallbackType.yKeys.length === 0)) {
    return {
      ...withFallbackType,
      yKeys: [withFallbackType.yKey],
    };
  }

  return withFallbackType;
}
