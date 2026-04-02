import type { SchemaColumn, SchemaTable } from "@/types";

function isNumericType(type: string): boolean {
  const normalized = type.toLowerCase();
  return (
    normalized.includes("int") ||
    normalized.includes("numeric") ||
    normalized.includes("decimal") ||
    normalized.includes("real") ||
    normalized.includes("double") ||
    normalized.includes("serial")
  );
}

function isTemporalType(type: string): boolean {
  const normalized = type.toLowerCase();
  return normalized.includes("timestamp") || normalized === "date" || normalized.includes("time");
}

function isCategoricalType(type: string): boolean {
  const normalized = type.toLowerCase();
  return (
    normalized.includes("char") ||
    normalized.includes("text") ||
    normalized === "boolean" ||
    normalized === "bool" ||
    normalized === "enum" ||
    normalized === "uuid"
  );
}

export function escapeIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

export function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "string") return `'${value}'`;
  if (typeof value === "number" || typeof value === "boolean") return `${value}`;
  if (value instanceof Date) return `'${value.toISOString()}'`;
  return `'${JSON.stringify(value)}'`;
}

export function extractRepresentativeValues(
  table: SchemaTable,
  column: SchemaColumn,
): string[] {
  if ((column.enumValues?.length ?? 0) > 0) {
    return column.enumValues ?? [];
  }

  if ((column.topValues?.length ?? 0) > 0) {
    return (column.topValues ?? []).map((item) => item.value).slice(0, 5);
  }

  const values = new Set<string>();
  for (const row of table.sampleData ?? []) {
    const raw = row[column.name];
    if (typeof raw === "string" && raw.trim()) {
      values.add(raw.trim());
    }
  }

  return Array.from(values).slice(0, 5);
}

export function buildRangeProfileQuery(
  tableName: string,
  columns: SchemaColumn[],
): string | null {
  const rangeColumns = columns.filter(
    (column) => isNumericType(column.type) || isTemporalType(column.type),
  );
  if (rangeColumns.length === 0) return null;

  const selectExpressions = rangeColumns
    .flatMap((column) => {
      const safeColumn = escapeIdentifier(column.name);
      const minAlias = escapeIdentifier(`${column.name}__min`);
      const maxAlias = escapeIdentifier(`${column.name}__max`);
      return [`MIN(${safeColumn})::text AS ${minAlias}`, `MAX(${safeColumn})::text AS ${maxAlias}`];
    })
    .join(", ");

  return `SELECT ${selectExpressions} FROM ${escapeIdentifier(tableName)}`;
}

export function buildTopValuesQuery(
  tableName: string,
  columns: SchemaColumn[],
): string | null {
  const categoricalColumns = columns.filter(
    (column) => isCategoricalType(column.type) || (column.enumValues?.length ?? 0) > 0,
  );
  if (categoricalColumns.length === 0) return null;

  const unions = categoricalColumns
    .map((column) => {
      const safeColumn = escapeIdentifier(column.name);
      const escapedColumnName = column.name.replace(/'/g, "''");
      return `SELECT '${escapedColumnName}' AS column_name, value, count
FROM (
  SELECT ${safeColumn}::text AS value, COUNT(*)::text AS count
  FROM ${escapeIdentifier(tableName)}
  WHERE ${safeColumn} IS NOT NULL
  GROUP BY ${safeColumn}
  ORDER BY COUNT(*) DESC, ${safeColumn}::text ASC
  LIMIT 5
) AS ${escapeIdentifier(`${column.name}__values`)}`;
    })
    .join("\nUNION ALL\n");

  return unions;
}
