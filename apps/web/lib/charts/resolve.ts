import type { ChartConfig, ChartHint, QueryResult } from "@/types";

import { withYKeys } from "./config";
import { detectChartConfig } from "./detect";
import { applyChartHint } from "./hints";

export function resolveChartConfig(
  result: QueryResult,
  hint?: ChartHint | null,
): ChartConfig {
  const base = detectChartConfig(result);
  const resolved = applyChartHint(base, result, hint);

  const withFallbackType = resolved.availableTypes.includes(resolved.type)
    ? resolved
    : {
        ...resolved,
        availableTypes: [resolved.type, ...resolved.availableTypes],
      };

  return withYKeys(withFallbackType);
}
