import { Pool } from "pg";
import type { Relationship, SchemaColumn, SchemaInfo, SchemaTable } from "@/types";

type ColumnRow = {
  table_name: string;
  column_name: string;
  data_type: string;
  full_data_type: string;
  is_nullable: "YES" | "NO";
  column_default: string | null;
  udt_schema: string;
  udt_name: string;
  is_pk: boolean;
  is_fk: boolean;
  foreign_table_name: string | null;
  foreign_column_name: string | null;
};

type TableRow = {
  table_name: string;
};

type EnumRow = {
  enum_schema: string;
  enum_name: string;
  enum_label: string;
};

type TopValueRow = {
  column_name: string;
  value: string;
  count: string;
};

const pools = new Map<string, Pool>();

function resolveConnectionString(connectionString?: string): string {
  const resolved = connectionString ?? process.env.DEMO_DATABASE_URL;
  if (!resolved) {
    throw new Error("Database connection string is not configured.");
  }
  return resolved;
}

function getPool(connectionString?: string): Pool {
  const key = connectionString ?? "demo";
  if (!pools.has(key)) {
    pools.set(
      key,
      new Pool({
        connectionString: resolveConnectionString(connectionString),
        ssl: { rejectUnauthorized: false },
        max: connectionString ? 3 : 10,
        idleTimeoutMillis: 30_000,
        connectionTimeoutMillis: 10_000,
      })
    );
  }

  const pool = pools.get(key);
  if (!pool) {
    throw new Error("Failed to initialize schema pool.");
  }

  return pool;
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "string") return `'${value}'`;
  if (typeof value === "number" || typeof value === "boolean") return `${value}`;
  if (value instanceof Date) return `'${value.toISOString()}'`;
  return `'${JSON.stringify(value)}'`;
}

function escapeIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

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

function extractRepresentativeValues(table: SchemaTable, column: SchemaColumn): string[] {
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

function buildRangeProfileQuery(tableName: string, columns: SchemaColumn[]): string | null {
  const rangeColumns = columns.filter((column) => isNumericType(column.type) || isTemporalType(column.type));
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

function buildTopValuesQuery(tableName: string, columns: SchemaColumn[]): string | null {
  const categoricalColumns = columns.filter(
    (column) => isCategoricalType(column.type) || (column.enumValues?.length ?? 0) > 0
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

function buildSummary(tables: SchemaTable[], relationships: Relationship[]): string {
  const lines: string[] = [
    "DATABASE SCHEMA SUMMARY",
    "=======================",
    `This database has ${tables.length} tables.`,
    "",
    "OVERVIEW:",
    `- Total tables: ${tables.length}`,
    `- Total relationships: ${relationships.length}`,
    "",
  ];

  for (const table of tables) {
    const rowLabel = typeof table.rowCount === "number" ? `${table.rowCount.toLocaleString()} rows` : "row count unavailable";
    lines.push(`TABLE: ${table.name} (${rowLabel})`);
    lines.push("  Columns:");

    for (const column of table.columns) {
      const typeLabel = column.fullType ?? column.type;
      const markers: string[] = [];
      if (column.isPrimaryKey) {
        markers.push("PRIMARY KEY");
      }

      if (column.isForeignKey && column.references) {
        markers.push(`FK → ${column.references.table}.${column.references.column}`);
      }

      const enumValues = extractRepresentativeValues(table, column);
      if (enumValues.length > 0) {
        markers.push(`values: ${enumValues.map((v) => `'${v}'`).join(", ")}`);
      }

      if (column.range) {
        markers.push(`range: ${column.range.min} → ${column.range.max}`);
      }

      if ((column.topValues?.length ?? 0) > 0) {
        markers.push(
          `top: ${(column.topValues ?? [])
            .map((item) => `'${item.value}' (${item.count})`)
            .join(", ")}`
        );
      }

      markers.push(column.nullable ? "NULLABLE" : "NOT NULL");

      if (column.defaultValue) {
        markers.push(`default: ${column.defaultValue}`);
      }

      const markerText = markers.length > 0 ? ` [${markers.join("; ")}]` : "";
      lines.push(`    - ${column.name}: ${typeLabel}${markerText}`);
    }

    lines.push("", "  Sample data:");

    if ((table.sampleData?.length ?? 0) === 0) {
      lines.push("    (no sample rows)");
    } else {
      for (const row of table.sampleData ?? []) {
        const values = table.columns
          .slice(0, 8)
          .map((column) => `${column.name}=${formatValue(row[column.name])}`)
          .join(", ");
        lines.push(`    ${values}`);
      }
    }

    lines.push("");
  }

  lines.push("RELATIONSHIPS:");
  if (relationships.length === 0) {
    lines.push("  (none detected)");
  } else {
    for (const relation of relationships) {
      lines.push(
        `  ${relation.fromTable}.${relation.fromColumn} → ${relation.toTable}.${relation.toColumn}`
      );
    }
  }

  return lines.join("\n");
}

export async function introspectSchema(connectionString?: string): Promise<SchemaInfo> {
  const pool = getPool(connectionString);

  const tablesResult = await pool.query<TableRow>(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `);

  const columnsResult = await pool.query<ColumnRow>(`
    SELECT
      c.table_name,
      c.column_name,
      c.data_type,
      pg_catalog.format_type(a.atttypid, a.atttypmod) AS full_data_type,
      c.is_nullable,
      c.column_default,
      c.udt_schema,
      c.udt_name,
      c.ordinal_position,
      CASE WHEN pk.column_name IS NOT NULL THEN true ELSE false END AS is_pk,
      CASE WHEN fk.column_name IS NOT NULL THEN true ELSE false END AS is_fk,
      fk.foreign_table_name,
      fk.foreign_column_name
    FROM information_schema.columns c
    JOIN pg_catalog.pg_namespace ns
      ON ns.nspname = c.table_schema
    JOIN pg_catalog.pg_class cls
      ON cls.relname = c.table_name AND cls.relnamespace = ns.oid
    JOIN pg_catalog.pg_attribute a
      ON a.attrelid = cls.oid AND a.attname = c.column_name AND a.attnum > 0 AND NOT a.attisdropped
    LEFT JOIN (
      SELECT kcu.table_name, kcu.column_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
      WHERE tc.constraint_type = 'PRIMARY KEY' AND tc.table_schema = 'public'
    ) pk ON pk.table_name = c.table_name AND pk.column_name = c.column_name
    LEFT JOIN (
      SELECT
        kcu.table_name,
        kcu.column_name,
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage ccu
        ON tc.constraint_name = ccu.constraint_name AND tc.table_schema = ccu.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'
    ) fk ON fk.table_name = c.table_name AND fk.column_name = c.column_name
    WHERE c.table_schema = 'public'
    ORDER BY c.table_name, c.ordinal_position
  `);

  const enumResult = await pool.query<EnumRow>(`
    SELECT
      n.nspname AS enum_schema,
      t.typname AS enum_name,
      e.enumlabel AS enum_label
    FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
    ORDER BY n.nspname, t.typname, e.enumsortorder
  `);

  const enumValuesByType = new Map<string, string[]>();
  for (const row of enumResult.rows) {
    const key = `${row.enum_schema}.${row.enum_name}`;
    const current = enumValuesByType.get(key) ?? [];
    current.push(row.enum_label);
    enumValuesByType.set(key, current);
  }

  const columnsByTable = new Map<string, SchemaColumn[]>();
  const relationships: Relationship[] = [];

  for (const row of columnsResult.rows) {
    const columns = columnsByTable.get(row.table_name) ?? [];

    const references =
      row.is_fk && row.foreign_table_name && row.foreign_column_name
        ? { table: row.foreign_table_name, column: row.foreign_column_name }
        : undefined;

    columns.push({
      name: row.column_name,
      type: row.data_type,
      fullType: row.full_data_type,
      nullable: row.is_nullable === "YES",
      isPrimaryKey: row.is_pk,
      isForeignKey: row.is_fk,
      references,
      defaultValue: row.column_default,
      enumValues: enumValuesByType.get(`${row.udt_schema}.${row.udt_name}`),
    });

    if (references) {
      relationships.push({
        fromTable: row.table_name,
        fromColumn: row.column_name,
        toTable: references.table,
        toColumn: references.column,
      });
    }

    columnsByTable.set(row.table_name, columns);
  }

  const tables: SchemaTable[] = [];

  for (const tableRow of tablesResult.rows) {
    const tableName = tableRow.table_name;
    const tableColumns = columnsByTable.get(tableName) ?? [];

    let rowCount: number | undefined;
    let sampleData: Record<string, unknown>[] = [];
    const safeTableName = escapeIdentifier(tableName);

    try {
      const countResult = await pool.query<{ estimate: string | number }>(
        "SELECT reltuples::bigint AS estimate FROM pg_class WHERE relname = $1",
        [tableName]
      );

      const estimate = countResult.rows[0]?.estimate;
      if (typeof estimate === "string") {
        rowCount = Number.parseInt(estimate, 10);
      } else if (typeof estimate === "number") {
        rowCount = Math.round(estimate);
      }

      if (typeof rowCount !== "number" || Number.isNaN(rowCount) || rowCount < 0) {
        const exactCountResult = await pool.query<{ count: string }>(
          `SELECT COUNT(*)::text AS count FROM ${safeTableName}`
        );
        rowCount = Number.parseInt(exactCountResult.rows[0]?.count ?? "0", 10);
      }
    } catch {
      rowCount = undefined;
    }

    try {
      const samples = await pool.query<Record<string, unknown>>(
        `SELECT * FROM ${safeTableName} LIMIT 3`
      );
      sampleData = samples.rows;
    } catch {
      sampleData = [];
    }

    try {
      const rangeQuery = buildRangeProfileQuery(tableName, tableColumns);
      if (rangeQuery) {
        const rangeResult = await pool.query<Record<string, string | null>>(rangeQuery);
        const rangeRow = rangeResult.rows[0];
        if (rangeRow) {
          for (const column of tableColumns) {
            const min = rangeRow[`${column.name}__min`];
            const max = rangeRow[`${column.name}__max`];
            if (typeof min === "string" && min.length > 0 && typeof max === "string" && max.length > 0) {
              column.range = { min, max };
            }
          }
        }
      }
    } catch {
      // Non-fatal: range profiling is best-effort metadata enrichment.
    }

    try {
      const topValuesQuery = buildTopValuesQuery(tableName, tableColumns);
      if (topValuesQuery) {
        const topValuesResult = await pool.query<TopValueRow>(topValuesQuery);
        const topValuesByColumn = new Map<string, Array<{ value: string; count: number }>>();
        for (const row of topValuesResult.rows) {
          const list = topValuesByColumn.get(row.column_name) ?? [];
          const parsedCount = Number.parseInt(row.count, 10);
          list.push({
            value: row.value,
            count: Number.isNaN(parsedCount) ? 0 : parsedCount,
          });
          topValuesByColumn.set(row.column_name, list);
        }

        for (const column of tableColumns) {
          const values = topValuesByColumn.get(column.name);
          if ((values?.length ?? 0) > 0) {
            column.topValues = values;
          }
        }
      }
    } catch {
      // Non-fatal: value distribution profiling is best-effort metadata enrichment.
    }

    tables.push({
      name: tableName,
      columns: tableColumns,
      rowCount,
      sampleData,
    });
  }

  return {
    tables,
    relationships,
    summary: buildSummary(tables, relationships),
  };
}
