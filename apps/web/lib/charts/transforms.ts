import type { QueryResult } from "@/types";
import { isDateLikeValue } from "./format";

/**
 * Time-axis hardening for date/time X columns:
 *  1. Timezone-truncated buckets — DATE_TRUNC on a tz-aware column yields e.g.
 *     `2025-10-31T18:30:00Z` (midnight in +05:30 stored as UTC). We detect a
 *     column whose values ALL share one non-midnight time-of-day (the tell of a
 *     truncated bucket, not real event times) and snap them to the intended
 *     calendar day, so labels read "Nov 2025" not "Oct 31, 6 PM".
 *  2. Gap filling — for a monthly grain with missing months between min and max,
 *     we insert the missing months (null measures) so the axis is continuous and
 *     the line honestly breaks at gaps instead of implying data.
 */
function timeOfDayMs(date: Date): number {
  return ((date.getUTCHours() * 60 + date.getUTCMinutes()) * 60 + date.getUTCSeconds()) * 1000 + date.getUTCMilliseconds();
}

function detectBucketShiftMs(dates: Date[]): number {
  if (dates.length < 2) return 0;
  const tod = timeOfDayMs(dates[0]);
  if (tod === 0) return 0;
  if (!dates.every((d) => timeOfDayMs(d) === tod)) return 0; // varied → real timestamps
  const HALF_DAY = 12 * 3600 * 1000;
  const DAY = 24 * 3600 * 1000;
  // East-of-UTC offsets store as previous evening (tod>12h) → advance to next
  // midnight; west-of-UTC store as same morning (tod<12h) → roll back.
  return tod > HALF_DAY ? DAY - tod : -tod;
}

function toDateOnlyIso(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

/** Snap timezone-truncated bucket values in the x column to their calendar day. */
export function hardenTimeAxis(result: QueryResult, xKey: string): QueryResult {
  const values = result.rows.map((row) => row[xKey]);
  if (!values.length || !values.every((v) => v == null || isDateLikeValue(v))) return result;
  const dates = values.filter((v) => v != null).map((v) => new Date(String(v)));
  if (dates.some((d) => Number.isNaN(d.getTime()))) return result;
  const shift = detectBucketShiftMs(dates);
  if (shift === 0) return result;
  const rows = result.rows.map((row) => {
    const raw = row[xKey];
    if (raw == null) return row;
    const shifted = new Date(new Date(String(raw)).getTime() + shift);
    return { ...row, [xKey]: toDateOnlyIso(shifted) };
  });
  return { ...result, rows };
}


/**
 * Scale helpers for multi-series charts whose series have very different
 * magnitudes or units (e.g. Electronics ~$1M vs Books ~$20k). Two strategies:
 *  - a secondary Y axis (keeps absolute values, good for exactly 2 series), and
 *  - index-to-100 normalization (compares growth/shape across any number of
 *    series and even across units).
 */

/** Largest absolute value in a series column. */
function seriesMax(rows: Record<string, unknown>[], key: string): number {
  let max = 0;
  for (const row of rows) {
    const n = Math.abs(Number(row[key]));
    if (Number.isFinite(n) && n > max) max = n;
  }
  return max;
}

/**
 * True when two series differ enough in magnitude that plotting them on one
 * axis would flatten the smaller one. Used to auto-enable a secondary axis.
 */
export function hasMismatchedScale(rows: Record<string, unknown>[], seriesKeys: string[]): boolean {
  if (seriesKeys.length !== 2) return false;
  const [a, b] = seriesKeys.map((key) => seriesMax(rows, key));
  const hi = Math.max(a, b);
  const lo = Math.min(a, b);
  return lo > 0 && hi / lo >= 8;
}

/** The series (of two) that should sit on the secondary axis — the smaller one. */
export function secondaryAxisSeries(rows: Record<string, unknown>[], seriesKeys: string[]): string | null {
  if (!hasMismatchedScale(rows, seriesKeys)) return null;
  const [a, b] = seriesKeys;
  return seriesMax(rows, a) >= seriesMax(rows, b) ? b : a;
}

/**
 * Convert each row's series values to a percentage of that row's total, for
 * 100%-stacked charts (composition over time/category).
 */
export function toPercentOfTotal(result: QueryResult, seriesKeys: string[]): QueryResult {
  const rows = result.rows.map((row) => {
    const total = seriesKeys.reduce((sum, key) => sum + (Number(row[key]) || 0), 0);
    const next: Record<string, unknown> = { ...row };
    for (const key of seriesKeys) {
      const value = Number(row[key]) || 0;
      next[key] = total > 0 ? (value / total) * 100 : 0;
    }
    return next;
  });
  return { ...result, rows };
}

/**
 * Re-index every series to 100 at its first non-zero point, so all series start
 * together and the chart shows relative growth. Returns a new result; the x
 * column is preserved.
 */
export function indexToHundred(result: QueryResult, seriesKeys: string[]): QueryResult {
  const baselines = new Map<string, number>();
  for (const key of seriesKeys) {
    const base = result.rows
      .map((row) => Number(row[key]))
      .find((value) => Number.isFinite(value) && value !== 0);
    if (base !== undefined) baselines.set(key, base);
  }
  const rows = result.rows.map((row) => {
    const next: Record<string, unknown> = { ...row };
    for (const key of seriesKeys) {
      const base = baselines.get(key);
      const value = Number(row[key]);
      next[key] = base && Number.isFinite(value) ? (value / base) * 100 : null;
    }
    return next;
  });
  return { ...result, rows };
}
