import type { DashboardDateRange, DateRangePreset } from "@query-wise/shared/types";

// SPEC-06 §5: the single global date control. Kept dependency-free so the header
// picker (client) and the refresh runtime (server) resolve ranges identically.

export const DATE_RANGE_PRESETS: DateRangePreset[] = ["7d", "30d", "90d", "mtd", "qtd", "ytd"];

export const DATE_RANGE_PRESET_LABELS: Record<DateRangePreset, string> = {
  "7d": "7 days",
  "30d": "30 days",
  "90d": "90 days",
  mtd: "MTD",
  qtd: "QTD",
  ytd: "YTD",
};

export interface ResolvedRange {
  from: Date;
  /** Exclusive upper bound (half-open interval [from, to)). */
  to: Date;
}

function startOfDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function isPreset(range: DashboardDateRange): range is { preset: DateRangePreset } {
  return typeof (range as { preset?: unknown }).preset === "string";
}

/**
 * Resolve a range into a concrete half-open [from, to) window. `to` is the start
 * of tomorrow (UTC) so "today" is always included; presets look back from there.
 */
export function resolveRange(range: DashboardDateRange, now: Date = new Date()): ResolvedRange {
  if (!isPreset(range)) {
    const from = new Date(range.from);
    const to = new Date(range.to);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from >= to) {
      // Fall back to a safe 90d window rather than emitting an invalid predicate.
      return resolveRange({ preset: "90d" }, now);
    }
    return { from, to };
  }
  const todayStart = startOfDay(now);
  const to = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000); // exclusive: end of today
  switch (range.preset) {
    case "7d":
      return { from: new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000), to };
    case "30d":
      return { from: new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000), to };
    case "90d":
      return { from: new Date(to.getTime() - 90 * 24 * 60 * 60 * 1000), to };
    case "mtd":
      return { from: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)), to };
    case "qtd": {
      const quarterStartMonth = Math.floor(now.getUTCMonth() / 3) * 3;
      return { from: new Date(Date.UTC(now.getUTCFullYear(), quarterStartMonth, 1)), to };
    }
    case "ytd":
      return { from: new Date(Date.UTC(now.getUTCFullYear(), 0, 1)), to };
    default:
      return { from: new Date(to.getTime() - 90 * 24 * 60 * 60 * 1000), to };
  }
}

export function isSameRange(a: DashboardDateRange | null, b: DashboardDateRange | null): boolean {
  if (a === null || b === null) return a === b;
  if (isPreset(a) && isPreset(b)) return a.preset === b.preset;
  if (!isPreset(a) && !isPreset(b)) return a.from === b.from && a.to === b.to;
  return false;
}

export function describeRange(range: DashboardDateRange | null): string {
  if (!range) return "All time";
  if (isPreset(range)) return DATE_RANGE_PRESET_LABELS[range.preset] ?? range.preset;
  return `${range.from.slice(0, 10)} → ${range.to.slice(0, 10)}`;
}
