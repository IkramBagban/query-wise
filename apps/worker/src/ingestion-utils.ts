/**
 * Pure, dependency-free helpers shared by the SPEC-03 profiling (§3) and join-inference (§5) stages.
 * Kept free of runtime imports (only `import type`) so the core logic is unit-testable in isolation.
 */

import type { ColumnProfile, MetadataColumn, MetadataEntity } from "@query-wise/shared/types";

const MAX_PROFILED_COLUMNS_PER_TABLE = 8;
const MAX_TOP_VALUES = 15;
const NUMERIC_TYPES = new Set<MetadataColumn["canonicalType"]>(["integer", "decimal"]);

export function isNumericColumn(column: MetadataColumn): boolean {
  return NUMERIC_TYPES.has(column.canonicalType);
}

export function isDateColumn(column: MetadataColumn): boolean {
  return column.canonicalType === "date" || column.canonicalType === "time" || column.canonicalType === "datetime";
}

// ── §3 profiling helpers ─────────────────────────────────────────────────────────────────────────

/** Columns worth a bounded MIN/MAX scan: dates and numerics, excluding keys/ids. Dates first. */
export function scannableColumns(entity: MetadataEntity): MetadataColumn[] {
  const eligible = entity.columns.filter((column) => {
    const lower = column.name.toLowerCase();
    if (column.primaryKey) return false;
    if (lower === "id" || lower.endsWith("_id")) return false;
    return isDateColumn(column) || isNumericColumn(column);
  });
  eligible.sort((left, right) => {
    const leftDate = isDateColumn(left) ? 0 : 1;
    const rightDate = isDateColumn(right) ? 0 : 1;
    if (leftDate !== rightDate) return leftDate - rightDate;
    return left.ordinal - right.ordinal;
  });
  return eligible.slice(0, MAX_PROFILED_COLUMNS_PER_TABLE);
}

/** Converts a `pg_stats.n_distinct` value to an absolute distinct count (negatives are fractions). */
export function convertDistinct(nDistinct: number | null, rowCount: number | null): number | undefined {
  if (nDistinct == null) return undefined;
  if (nDistinct >= 0) return Math.round(nDistinct);
  if (rowCount != null && rowCount > 0) return Math.round(-nDistinct * rowCount);
  return undefined;
}

export function parseTopValues(mcv: unknown, freqs: unknown, rowCount: number | null): ColumnProfile["topValues"] {
  if (!Array.isArray(mcv) || mcv.length === 0) return undefined;
  const frequencies = Array.isArray(freqs) ? freqs : [];
  const values = mcv.slice(0, MAX_TOP_VALUES).map((value, index) => {
    const freq = typeof frequencies[index] === "number" ? (frequencies[index] as number) : undefined;
    const count = freq != null && rowCount != null && rowCount > 0 ? Math.round(freq * rowCount) : undefined;
    return count != null ? { value: String(value), count } : { value: String(value) };
  });
  return values.length > 0 ? values : undefined;
}

/** Normalizes a MIN/MAX bound to a JSON-stable primitive (ISO string for dates, number for numerics). */
export function serializeBound(value: unknown): string | number | undefined {
  if (value == null) return undefined;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "string") {
    const asNumber = Number(value);
    return Number.isFinite(asNumber) && String(asNumber) === value ? asNumber : value;
  }
  return String(value);
}

// ── §5 join-inference helpers ───────────────────────────────────────────────────────────────────

export function typesCompatible(a: MetadataColumn["canonicalType"], b: MetadataColumn["canonicalType"]): boolean {
  if (a === b) return true;
  return NUMERIC_TYPES.has(a) && NUMERIC_TYPES.has(b);
}

/** Candidate target entity names for a `<prefix>_id` column via simple pluralization rules. */
export function candidateTargetNames(prefix: string): Set<string> {
  const base = prefix.toLowerCase();
  const names = new Set<string>([base, `${base}s`, `${base}es`]);
  if (base.endsWith("y")) names.add(`${base.slice(0, -1)}ies`);
  return names;
}

/** Crude singularization so a plural entity name (`customers`) matches a `customer_id` column. */
export function singularize(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith("ies")) return `${lower.slice(0, -3)}y`;
  if (lower.endsWith("es")) return lower.slice(0, -2);
  if (lower.endsWith("s")) return lower.slice(0, -1);
  return lower;
}

/** Resolves the primary-key column to reference on a candidate target (prefers a PK named `id`). */
export function resolveTargetPk(entity: MetadataEntity): MetadataColumn | undefined {
  const pks = entity.columns.filter((column) => column.primaryKey);
  const named = pks.find((column) => column.name.toLowerCase() === "id");
  if (named) return named;
  return pks.length === 1 ? pks[0] : undefined;
}
