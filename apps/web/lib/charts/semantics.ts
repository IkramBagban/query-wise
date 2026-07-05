import { abbreviateNumber, formatFullNumber } from "./format";

/**
 * Column *semantics*: what a number MEANS, so we can format it correctly —
 * without ever guessing wrong. The guiding rule (per product decision): only
 * apply a semantic format when we have real evidence for it; otherwise fall
 * back to a plain, safe number.
 *
 * Crucially we NEVER emit a currency symbol from inference. We cannot tell $
 * from ₹ from € by looking at a number, and a wrong symbol is worse than none.
 * "Money-like" columns are formatted nicely (grouping + 2 decimals) but stay
 * symbol-less. A symbol may only be attached later from explicit connection
 * metadata, never inferred here.
 */

export type NumberFormatKind = "amount" | "percent" | "count" | "duration" | "bytes" | "number";

export interface ColumnFormat {
  kind: NumberFormatKind;
  /** Multiplier applied before display (e.g. 100 for fraction→percent). */
  scale: number;
  /** For duration: the unit the raw values are already in. */
  durationUnit?: "ms" | "s";
}

export const PLAIN_NUMBER: ColumnFormat = { kind: "number", scale: 1 };

const PERCENT_EXPLICIT = /(^|_)(pct|percent|percentage)(_|$)/i;
const PERCENT_MAYBE = /(^|_)(rate|ratio|share|margin|conversion|cvr|ctr|churn|retention)(_|$)/i;
const DURATION_MS = /(_ms$|_millis|latency_ms|response_ms)/i;
const DURATION_S = /(duration|elapsed|_seconds?$|_sec$|response_time|processing_time|time_spent)/i;
const BYTES = /(bytes|_size$|filesize|payload_size|file_size)/i;
const COUNT = /(^|_)(count|qty|quantity|orders?|users?|sessions?|visits?|clicks?|items?|units?|views?|signups?|n)(_|$)|num_|_num$/i;
const AMOUNT = /(revenue|sales|price|cost|amount|spend|profit|gross|net|payment|charge|salary|balance|gmv|arpu|mrr|arr|income|fee|deposit|refund|total_value)/i;

function collectNumbers(rows: Record<string, unknown>[], key: string): number[] {
  const out: number[] = [];
  for (const row of rows) {
    const value = row[key];
    const n = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
    if (Number.isFinite(n)) out.push(n);
    if (out.length >= 200) break;
  }
  return out;
}

/**
 * Infer how a numeric column should be formatted. Conservative by design: an
 * ambiguous column returns a plain number.
 */
export function inferColumnFormat(column: string, rows: Record<string, unknown>[]): ColumnFormat {
  const name = column.toLowerCase();
  const values = collectNumbers(rows, column);
  if (values.length === 0) return PLAIN_NUMBER;
  const allInteger = values.every((v) => Number.isInteger(v));
  const maxAbs = Math.max(...values.map((v) => Math.abs(v)));
  const withinFraction = values.every((v) => Math.abs(v) <= 1);

  // Percent — explicit name always; "rate/ratio"-style only when values are a
  // 0–1 fraction we can confidently scale to a percentage.
  if (PERCENT_EXPLICIT.test(name)) {
    return { kind: "percent", scale: withinFraction ? 100 : 1 };
  }
  if (PERCENT_MAYBE.test(name) && withinFraction) {
    return { kind: "percent", scale: 100 };
  }

  if (DURATION_MS.test(name)) return { kind: "duration", scale: 1, durationUnit: "ms" };
  if (DURATION_S.test(name)) return { kind: "duration", scale: 1, durationUnit: "s" };
  if (BYTES.test(name) && maxAbs >= 1024) return { kind: "bytes", scale: 1 };

  // Money-like → nice formatting, but SYMBOL-LESS (we don't know the currency).
  if (AMOUNT.test(name)) return { kind: "amount", scale: 1 };

  if (COUNT.test(name) && allInteger) return { kind: "count", scale: 1 };

  return PLAIN_NUMBER;
}

/** Infer formats for every column in a result, once. */
export function inferResultFormats(
  columns: string[],
  rows: Record<string, unknown>[],
): Map<string, ColumnFormat> {
  return new Map(columns.map((column) => [column, inferColumnFormat(column, rows)]));
}

function formatDuration(value: number, unit: "ms" | "s"): string {
  const seconds = unit === "ms" ? value / 1000 : value;
  if (Math.abs(seconds) < 1) return `${Math.round(seconds * 1000)}ms`;
  if (Math.abs(seconds) < 60) return `${trim(seconds)}s`;
  if (Math.abs(seconds) < 3600) {
    const m = Math.floor(seconds / 60);
    const s = Math.round(seconds % 60);
    return s ? `${m}m ${s}s` : `${m}m`;
  }
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return m ? `${h}h ${m}m` : `${h}h`;
}

function formatBytes(value: number): string {
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  let v = Math.abs(value);
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${value < 0 ? "-" : ""}${trim(v)} ${units[i]}`;
}

function trim(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

/** Compact form for axis ticks. */
export function formatCompactAs(value: unknown, format: ColumnFormat): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value ?? "");
  switch (format.kind) {
    case "percent":
      return `${trim(n * format.scale)}%`;
    case "duration":
      return formatDuration(n, format.durationUnit ?? "s");
    case "bytes":
      return formatBytes(n);
    case "count":
    case "amount":
    case "number":
    default:
      return abbreviateNumber(n);
  }
}

/** Full form for tooltips, labels, and tables. */
export function formatFullAs(value: unknown, format: ColumnFormat): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value ?? "");
  switch (format.kind) {
    case "percent":
      return `${(n * format.scale).toLocaleString("en-US", { maximumFractionDigits: 2 })}%`;
    case "duration":
      return formatDuration(n, format.durationUnit ?? "s");
    case "bytes":
      return formatBytes(n);
    case "count":
      return Math.round(n).toLocaleString("en-US");
    case "amount":
      return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    case "number":
    default:
      return formatFullNumber(n);
  }
}
