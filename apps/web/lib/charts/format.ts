/**
 * Shared value formatting for chart axes, ticks, tooltips, and stat cards.
 * Charts are only as trustworthy as their labels — raw ISO timestamps
 * (2025-10-31T18:30:00.000Z) and unseparated numbers (2729077.09) read as
 * broken. These helpers turn them into "Oct 2025" and "$2.73M"-style labels.
 */

/** A string/Date that parses as a real calendar date (not a bare number). */
export function isDateLikeValue(value: unknown): boolean {
  if (value instanceof Date) return !Number.isNaN(value.getTime());
  if (typeof value !== "string") return false;
  const text = value.trim();
  // Require date-ish punctuation so plain numeric strings ("572") aren't dates.
  if (!/[-/:T]/.test(text) || text.length < 8) return false;
  return !Number.isNaN(Date.parse(text));
}

/**
 * Compact axis label for a date. Month-start values (day === 1) are treated as
 * monthly buckets → "Oct 2025"; dated values → "Oct 5"; timestamps keep the
 * hour → "Oct 5, 2 PM".
 */
export function formatDateLabel(value: unknown): string {
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value ?? "");
  const hasTime = date.getHours() !== 0 || date.getMinutes() !== 0 || date.getSeconds() !== 0;
  if (hasTime) {
    return date.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric" });
  }
  if (date.getDate() === 1) {
    return date.toLocaleDateString("en-US", { month: "short", year: "numeric" });
  }
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** 1_234_567 → "1.2M", 12_300 → "12.3k", 6.88 → "6.88". */
export function abbreviateNumber(value: number): string {
  if (!Number.isFinite(value)) return String(value);
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1e9) return `${sign}${trimZeros(abs / 1e9)}B`;
  if (abs >= 1e6) return `${sign}${trimZeros(abs / 1e6)}M`;
  if (abs >= 1e3) return `${sign}${trimZeros(abs / 1e3)}k`;
  if (Number.isInteger(value)) return value.toLocaleString("en-US");
  return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function trimZeros(value: number): string {
  return value
    .toFixed(1)
    .replace(/\.0$/, "");
}

/** Full, grouped number for tooltips/tables where precision matters. */
export function formatFullNumber(value: number): string {
  if (!Number.isFinite(value)) return String(value);
  return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && /^-?\d+(\.\d+)?$/.test(value.trim())) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/** Axis tick: dates → compact date, numbers → abbreviated, text → truncated. */
export function formatAxisTick(value: unknown): string {
  if (isDateLikeValue(value)) return formatDateLabel(value);
  const numeric = toNumber(value);
  if (numeric !== null) return abbreviateNumber(numeric);
  const text = String(value ?? "");
  return text.length > 16 ? `${text.slice(0, 16)}…` : text;
}

/** Tooltip/label value: dates → full date, numbers → grouped full number. */
export function formatValue(value: unknown): string {
  if (isDateLikeValue(value)) {
    const date = value instanceof Date ? value : new Date(String(value));
    const hasTime = date.getHours() !== 0 || date.getMinutes() !== 0 || date.getSeconds() !== 0;
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      ...(hasTime ? { hour: "numeric", minute: "2-digit" } : {}),
    });
  }
  const numeric = toNumber(value);
  if (numeric !== null) return formatFullNumber(numeric);
  return String(value ?? "");
}

/** snake_case column → "Snake case" for readable series/legend labels. */
export function labelize(value: string): string {
  return value.replace(/_/g, " ");
}
