import { AppError } from "@/lib/v2/dal/core";
import type { BoundedQueryResult, BoundedResultPreview, JsonValue } from "@/types/v2";

const MAX_PREVIEW_ROWS = 100;
const MAX_COLUMNS = 50;
const MAX_BYTES = 256 * 1024;

function jsonSafe(value: unknown): JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : String(value);
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(jsonSafe);
  if (typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, jsonSafe(nested)]));
  }
  return String(value);
}

export function createResultPreview(result: BoundedQueryResult): BoundedResultPreview {
  const columns = result.columns.slice(0, MAX_COLUMNS);
  let rows = result.rows.slice(0, MAX_PREVIEW_ROWS).map((row) =>
    Object.fromEntries(columns.map((column) => [column.name, jsonSafe(row[column.name])]))
  );
  let preview = {
    schemaVersion: 1 as const,
    columns,
    rows,
    previewRowCount: rows.length,
    returnedRowCount: result.returnedRowCount,
    totalRowCount: result.totalRowCount,
    truncated: result.truncated || result.rows.length > rows.length || result.columns.length > columns.length,
    bytes: 0,
  };
  let bytes = Buffer.byteLength(JSON.stringify(preview));
  while (bytes > MAX_BYTES && rows.length > 0) {
    rows = rows.slice(0, Math.floor(rows.length / 2));
    preview = { ...preview, rows, previewRowCount: rows.length, truncated: true };
    bytes = Buffer.byteLength(JSON.stringify(preview));
  }
  if (bytes > MAX_BYTES) throw new AppError("RESULT_LIMIT_EXCEEDED", "The bounded result preview is too large.");
  return { ...preview, bytes };
}
