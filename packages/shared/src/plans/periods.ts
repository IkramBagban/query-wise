/**
 * Quota windows are UTC. Day = YYYY-MM-DD, Month = YYYY-MM. Pure helpers so unit
 * tests can pin boundaries (month end, leap day) without a database.
 */

export type PeriodType = "day" | "month";

/** UTC day key, e.g. "2026-07-09". */
export function dayPeriodKey(at: Date = new Date()): string {
  return at.toISOString().slice(0, 10);
}

/** UTC month key, e.g. "2026-07". */
export function monthPeriodKey(at: Date = new Date()): string {
  return at.toISOString().slice(0, 7);
}

export function periodKey(periodType: PeriodType, at: Date = new Date()): string {
  return periodType === "day" ? dayPeriodKey(at) : monthPeriodKey(at);
}

/**
 * Seconds until the next UTC midnight — used for `retryAfterSeconds` on daily
 * quota errors. Always >= 1.
 */
export function secondsUntilNextUtcMidnight(at: Date = new Date()): number {
  const next = new Date(Date.UTC(
    at.getUTCFullYear(),
    at.getUTCMonth(),
    at.getUTCDate() + 1,
    0, 0, 0, 0,
  ));
  return Math.max(1, Math.ceil((next.getTime() - at.getTime()) / 1000));
}

/**
 * Seconds until the first day of the next UTC month — used for `retryAfterSeconds`
 * on monthly quota errors. Always >= 1.
 */
export function secondsUntilNextUtcMonth(at: Date = new Date()): number {
  const next = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth() + 1, 1, 0, 0, 0, 0));
  return Math.max(1, Math.ceil((next.getTime() - at.getTime()) / 1000));
}
