/** Display helpers for admin tables (numbers, bigints, dates). */

export function bigintToNumber(value: bigint | number | null | undefined): number {
  if (value == null) return 0;
  if (typeof value === "number") return value;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function formatInt(value: number | bigint | null | undefined): string {
  const n = bigintToNumber(value ?? 0);
  return new Intl.NumberFormat("en-US").format(n);
}

export function formatCompact(value: number | bigint | null | undefined): string {
  const n = bigintToNumber(value ?? 0);
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(n);
}

export function formatUtcDate(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toISOString().replace("T", " ").slice(0, 19) + "Z";
}

export function formatUtcDay(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toISOString().slice(0, 10);
}

export function tokensSum(
  input: number | bigint | null | undefined,
  output: number | bigint | null | undefined,
): number {
  return bigintToNumber(input) + bigintToNumber(output);
}

export function hasAnyOverride(o: {
  questionsPerDayOverride?: number | null;
  questionsPerMonthOverride?: number | null;
  maxConnectionsOverride?: number | null;
  maxDashboardsOverride?: number | null;
  schemaRefreshesPerDayOverride?: number | null;
}): boolean {
  return (
    o.questionsPerDayOverride != null ||
    o.questionsPerMonthOverride != null ||
    o.maxConnectionsOverride != null ||
    o.maxDashboardsOverride != null ||
    o.schemaRefreshesPerDayOverride != null
  );
}

export const PAGE_SIZE = 50;
