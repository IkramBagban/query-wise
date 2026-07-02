import type { ChartConfig, ChartHint, QueryResult } from "@/types";

import { HIGH_CARDINALITY_DIMENSION, MAX_PIE_CATEGORIES } from "./constants";
import { makeConfig } from "./config";
import { inferColumnProfile, isNumericResultColumn } from "./profiles";
import { validateAxisSemantics } from "./axis";

function applyChartHintInternal(
  base: ChartConfig,
  result: QueryResult,
  hint?: ChartHint | null,
): ChartConfig {
  if (!hint?.type) return base;

  const { columns, rows } = result;
  const columnSet = new Set(columns);

  const hasColumn = (key?: string): key is string => Boolean(key && columnSet.has(key));
  const numericKeys = (hint.yKeys ?? []).filter(
    (key) => hasColumn(key) && isNumericResultColumn(rows, key),
  );

  if (hint.type === "pie") {
    if (!hasColumn(hint.nameKey) || !hasColumn(hint.valueKey)) return base;
    if (!isNumericResultColumn(rows, hint.valueKey)) return base;
    const nameProfile = inferColumnProfile(rows, hint.nameKey);
    if (nameProfile.distinctCount > MAX_PIE_CATEGORIES) return base;
    return makeConfig("pie", {
      nameKey: hint.nameKey,
      valueKey: hint.valueKey,
      availableTypes: ["pie", "bar", "line", "area", "scatter", "table"],
    });
  }

  if (hint.type === "table") {
    return makeConfig("table", {
      availableTypes: ["table", "bar", "line", "area", "scatter", "pie"],
    });
  }

  if (!hasColumn(hint.xKey)) return base;
  const xProfile = inferColumnProfile(rows, hint.xKey);
  if (xProfile.kind === "text" && xProfile.distinctCount > HIGH_CARDINALITY_DIMENSION) {
    return base;
  }
  const chosenYKeys = numericKeys.length > 0 ? numericKeys : undefined;
  const chosenYKey =
    (hasColumn(hint.yKey) && isNumericResultColumn(rows, hint.yKey) && hint.yKey) ||
    chosenYKeys?.[0];

  if (!chosenYKey) return base;

  return makeConfig(hint.type, {
    xKey: hint.xKey,
    yKey: chosenYKey,
    yKeys: chosenYKeys ?? [chosenYKey],
    availableTypes:
      xProfile.kind === "date"
        ? ["line", "area", "bar", "scatter", "table"]
        : ["bar", "line", "area", "scatter", "pie", "table"],
  });
}

export function applyChartHint(
  base: ChartConfig,
  result: QueryResult,
  hint?: ChartHint | null,
): ChartConfig {
  const resolved = applyChartHintInternal(base, result, hint);

  if (resolved.type !== "table" && !validateAxisSemantics(resolved.type, result.rows, resolved)) {
    // Try to correct by swapping x and y if it's a 2-axis chart with a single y-key
    if (
      resolved.type !== "pie" &&
      resolved.xKey &&
      resolved.yKey &&
      (!resolved.yKeys || resolved.yKeys.length === 1)
    ) {
      const swapped = {
        ...resolved,
        xKey: resolved.yKey,
        yKey: resolved.xKey,
        yKeys: [resolved.xKey],
      };
      if (validateAxisSemantics(swapped.type, result.rows, swapped)) {
        return swapped;
      }
    }

    return makeConfig("table", { availableTypes: resolved.availableTypes });
  }

  return resolved;
}
