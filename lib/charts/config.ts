import type { ChartConfig, ChartType } from "@/types";

export function makeConfig(
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

export function withYKeys(config: ChartConfig): ChartConfig {
  if (config.yKey && (!config.yKeys || config.yKeys.length === 0)) {
    return { ...config, yKeys: [config.yKey] };
  }
  return config;
}
