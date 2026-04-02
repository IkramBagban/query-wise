import { isDateColumn, isNumericColumn } from "@/lib/utils";

import type { ColumnProfile } from "./types";

function parseNumeric(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!/^-?\d+(\.\d+)?$/.test(trimmed)) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseDate(value: unknown): number | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.getTime();
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length < 8) return null;
  const ts = Date.parse(trimmed);
  return Number.isNaN(ts) ? null : ts;
}

function isLikelyIdColumn(column: string): boolean {
  const normalized = column.toLowerCase();
  return normalized === "id" || normalized.endsWith("_id") || normalized.endsWith("id");
}

export function inferColumnProfile(
  rows: Record<string, unknown>[],
  column: string,
): ColumnProfile {
  let nonNullCount = 0;
  let numericCount = 0;
  let dateCount = 0;
  const distinct = new Set<string>();

  for (const row of rows) {
    const value = row[column];
    if (value === null || value === undefined) continue;
    nonNullCount += 1;

    if (parseDate(value) !== null) {
      dateCount += 1;
    }
    if (parseNumeric(value) !== null) {
      numericCount += 1;
    }

    if (distinct.size < 200) {
      distinct.add(String(value));
    }
  }

  const firstNonNull = rows.find((row) => row[column] != null)?.[column];
  const firstTypeHint =
    firstNonNull instanceof Date
      ? "timestamp"
      : typeof firstNonNull === "number"
        ? "numeric"
        : typeof firstNonNull === "string"
          ? parseNumeric(firstNonNull) !== null
            ? "numeric"
            : parseDate(firstNonNull) !== null
              ? "timestamp"
              : "text"
          : "text";

  const dateLikeByName = isDateColumn(column, firstTypeHint);
  const numericLikeByName = isNumericColumn(firstTypeHint);

  const dateRatio = nonNullCount > 0 ? dateCount / nonNullCount : 0;
  const numericRatio = nonNullCount > 0 ? numericCount / nonNullCount : 0;

  let kind: ColumnProfile["kind"] = "text";
  if (dateLikeByName || dateRatio >= 0.7) {
    kind = "date";
  } else if (numericLikeByName || numericRatio >= 0.7) {
    kind = "numeric";
  }

  return {
    kind,
    distinctCount: distinct.size,
    nonNullCount,
    likelyId: isLikelyIdColumn(column),
  };
}

export function isNumericResultColumn(
  rows: Record<string, unknown>[],
  column: string,
): boolean {
  const profile = inferColumnProfile(rows, column);
  return profile.kind === "numeric";
}

export function pickBestDimensionColumn(
  columns: string[],
  profiles: Map<string, ColumnProfile>,
): string | null {
  const preferred = columns.find((column) => profiles.get(column)?.kind === "date");
  if (preferred) return preferred;
  const textDimension = columns.find((column) => profiles.get(column)?.kind === "text");
  if (textDimension) return textDimension;
  return columns[0] ?? null;
}
