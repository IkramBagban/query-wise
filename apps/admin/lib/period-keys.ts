import {
  dayPeriodKey,
  monthPeriodKey,
} from "@query-wise/shared/plans";

export { dayPeriodKey, monthPeriodKey };

/** Last N UTC day keys ending today (inclusive), oldest first. */
export function lastNDayKeys(n: number, at: Date = new Date()): string[] {
  const keys: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(at.getTime() - i * 24 * 60 * 60 * 1000);
    keys.push(dayPeriodKey(d));
  }
  return keys;
}

/** Start of UTC day for a day key "YYYY-MM-DD". */
export function utcDayStart(dayKey: string): Date {
  return new Date(`${dayKey}T00:00:00.000Z`);
}

/** End of UTC day (exclusive next midnight). */
export function utcDayEndExclusive(dayKey: string): Date {
  const start = utcDayStart(dayKey);
  return new Date(start.getTime() + 24 * 60 * 60 * 1000);
}

export function startOfUtcMonth(at: Date = new Date()): Date {
  return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), 1));
}

export function startOfPrevUtcMonth(at: Date = new Date()): Date {
  return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth() - 1, 1));
}

export function clampDateRange(
  from: Date,
  to: Date,
  maxDays = 90,
): { from: Date; to: Date } {
  let start = from.getTime() <= to.getTime() ? from : to;
  let end = from.getTime() <= to.getTime() ? to : from;
  const maxMs = maxDays * 24 * 60 * 60 * 1000;
  if (end.getTime() - start.getTime() > maxMs) {
    start = new Date(end.getTime() - maxMs);
  }
  return { from: start, to: end };
}
