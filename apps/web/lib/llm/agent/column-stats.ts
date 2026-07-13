import type { BoundedQueryResult } from "@query-wise/shared/types";

/**
 * Full-result column statistics (SPEC-10 §2.1).
 *
 * WHY: the 2026-07-12 incident shipped "revenue is consistent around $1M" while
 * Nov/Dec 2025 spiked to ~$2.7M. Every summarization step (digest, verifier
 * evidence) had only a 3–5 row window that missed rows 7–8 where the spike lived.
 * These stats are computed over the FULL result (up to the 500-row cap) so the
 * extremes survive every elision by construction — the design rule in SPEC-10 §1:
 * "no summarization step may hide extremes."
 */
export interface ColumnStats {
  column: string;
  kind: "numeric" | "temporal";
  min: string | number | null;
  max: string | number | null;
  /** numeric only, rounded to 2dp. */
  mean?: number;
  /** full row at the min (numeric only) — lets a digest name WHEN the min occurred. */
  minRow?: Record<string, unknown>;
  /** full row at the max (numeric only) — lets a digest name WHEN the max occurred. */
  maxRow?: Record<string, unknown>;
}

/** Cap on stats entries per result; numerics are prioritized over temporals. */
const MAX_STATS_ENTRIES = 8;
/** How many non-null values to sample when classifying a column's kind. */
const CLASSIFY_SAMPLE = 50;

/** Matches ISO-ish temporal strings: 2025-11, 2025-11-30, 2025-11-30T12:00:00Z. */
const TEMPORAL_PATTERN = /^\d{4}-\d{2}(-\d{2}([T ]\d{2}:\d{2}(:\d{2})?)?)?/;

function isNullish(value: unknown): boolean {
  return value === null || value === undefined || value === "";
}

/** Parse a value as a finite number, tolerating Postgres numerics arriving as strings. */
function asNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "") return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/** True when the value looks temporal (Date instance or ISO-ish string). */
function isTemporal(value: unknown): boolean {
  if (value instanceof Date) return !Number.isNaN(value.getTime());
  if (typeof value === "string") {
    const trimmed = value.trim();
    return TEMPORAL_PATTERN.test(trimmed) && !Number.isNaN(Date.parse(trimmed));
  }
  return false;
}

/** Comparable timestamp for temporal ordering; falls back to lexical via NaN guard. */
function temporalKey(value: unknown): number {
  if (value instanceof Date) return value.getTime();
  const parsed = Date.parse(String(value));
  return Number.isNaN(parsed) ? 0 : parsed;
}

type ColumnKind = "numeric" | "temporal" | "other";

/**
 * Classify a column by sampling its non-null values. A column is numeric only
 * when EVERY sampled non-null value parses as a finite number, and temporal only
 * when every sampled value is temporal — so a mixed column falls through to
 * "other" and is skipped (never mislabeled). Numeric wins ties (a year column of
 * ints is a measure, not a date).
 */
function classifyColumn(rows: Record<string, unknown>[], column: string): ColumnKind {
  let sampled = 0;
  let numeric = 0;
  let temporal = 0;
  for (const row of rows) {
    const value = row[column];
    if (isNullish(value)) continue;
    sampled += 1;
    if (asNumber(value) !== null) numeric += 1;
    else if (isTemporal(value)) temporal += 1;
    if (sampled >= CLASSIFY_SAMPLE) break;
  }
  if (sampled === 0) return "other";
  if (numeric === sampled) return "numeric";
  if (temporal === sampled) return "temporal";
  return "other";
}

function numericStats(rows: Record<string, unknown>[], column: string): ColumnStats | null {
  let min: number | null = null;
  let max: number | null = null;
  let minRow: Record<string, unknown> | undefined;
  let maxRow: Record<string, unknown> | undefined;
  let sum = 0;
  let count = 0;
  for (const row of rows) {
    const parsed = asNumber(row[column]);
    if (parsed === null) continue;
    count += 1;
    sum += parsed;
    if (min === null || parsed < min) {
      min = parsed;
      minRow = row;
    }
    if (max === null || parsed > max) {
      max = parsed;
      maxRow = row;
    }
  }
  if (count === 0) return null;
  return {
    column,
    kind: "numeric",
    min,
    max,
    mean: Math.round((sum / count) * 100) / 100,
    minRow,
    maxRow,
  };
}

function temporalStats(rows: Record<string, unknown>[], column: string): ColumnStats | null {
  let min: unknown = null;
  let max: unknown = null;
  let minKey = Number.POSITIVE_INFINITY;
  let maxKey = Number.NEGATIVE_INFINITY;
  let count = 0;
  for (const row of rows) {
    const value = row[column];
    if (isNullish(value)) continue;
    count += 1;
    const key = temporalKey(value);
    if (key < minKey) {
      minKey = key;
      min = value;
    }
    if (key > maxKey) {
      maxKey = key;
      max = value;
    }
  }
  if (count === 0) return null;
  const asString = (value: unknown): string =>
    value instanceof Date ? value.toISOString() : String(value);
  return { column, kind: "temporal", min: asString(min), max: asString(max) };
}

/**
 * Compute per-column statistics over the FULL result rows (SPEC-10 §2.1). Pure
 * and deterministic. Numeric columns carry min/max/mean plus the full min/max
 * rows; temporal columns carry min/max only. Non-numeric, non-temporal columns
 * are skipped. Capped at 8 entries, numerics prioritized.
 */
export function computeColumnStats(result: BoundedQueryResult): ColumnStats[] {
  const rows = result.rows as Record<string, unknown>[];
  if (!Array.isArray(rows) || rows.length === 0) return [];
  const columns = result.columns.map((column) => column.name);

  const numerics: ColumnStats[] = [];
  const temporals: ColumnStats[] = [];
  for (const column of columns) {
    const kind = classifyColumn(rows, column);
    if (kind === "numeric") {
      const stats = numericStats(rows, column);
      if (stats) numerics.push(stats);
    } else if (kind === "temporal") {
      const stats = temporalStats(rows, column);
      if (stats) temporals.push(stats);
    }
  }
  // Numerics first so measures (the thing claims are made about) always win the cap.
  return [...numerics, ...temporals].slice(0, MAX_STATS_ENTRIES);
}

/** Format a numeric value compactly for evidence lines (drops trailing .00). */
function formatStatValue(value: string | number | null): string {
  if (value === null) return "n/a";
  if (typeof value === "number") {
    return Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100);
  }
  return value;
}

/**
 * Pick a short human label for a min/max row (SPEC-10 §2.5): the value of the
 * first temporal column, else the first string column that is not the measure
 * itself — so `max 2729077.09 (2025-11)` tells the verifier WHEN the extreme was.
 */
function labelForRow(
  row: Record<string, unknown> | undefined,
  measureColumn: string,
  labelColumn: string | null,
): string | null {
  if (!row) return null;
  const key = labelColumn && labelColumn !== measureColumn ? labelColumn : null;
  if (!key) return null;
  const value = row[key];
  if (isNullish(value)) return null;
  return value instanceof Date ? value.toISOString() : String(value);
}

/**
 * Render a one-line, human-readable stats summary for verifier evidence and
 * correction context (SPEC-10 §2.5). Example:
 * `total_revenue min 807277.43 (2026-01) · max 2729077.09 (2025-11) · mean 1306474.24`.
 * Returns "" when there is nothing numeric/temporal to report.
 */
export function renderColumnStatsLine(stats: ColumnStats[]): string {
  if (stats.length === 0) return "";
  const labelColumn = stats.find((entry) => entry.kind === "temporal")?.column ?? null;
  const parts = stats.map((entry) => {
    if (entry.kind === "temporal") {
      return `${entry.column} range ${formatStatValue(entry.min)} → ${formatStatValue(entry.max)}`;
    }
    const minLabel = labelForRow(entry.minRow, entry.column, labelColumn);
    const maxLabel = labelForRow(entry.maxRow, entry.column, labelColumn);
    const min = `min ${formatStatValue(entry.min)}${minLabel ? ` (${minLabel})` : ""}`;
    const max = `max ${formatStatValue(entry.max)}${maxLabel ? ` (${maxLabel})` : ""}`;
    const mean = entry.mean !== undefined ? ` · mean ${formatStatValue(entry.mean)}` : "";
    return `${entry.column} ${min} · ${max}${mean}`;
  });
  return parts.join(" | ");
}
