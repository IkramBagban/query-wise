import { Pool } from "pg";
import type { Relationship, SchemaColumn, SchemaInfo, SchemaTable } from "@/types";

type ColumnRow = {
  table_name: string;
  column_name: string;
  data_type: string;
  is_nullable: "YES" | "NO";
  is_pk: boolean;
  is_fk: boolean;
  foreign_table_name: string | null;
  foreign_column_name: string | null;
};

type TableRow = {
  table_name: string;
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

function extractEnumLikeValues(table: SchemaTable, column: SchemaColumn): string[] {
  const type = column.type.toLowerCase();
  if (!type.includes("char") && !type.includes("text")) {
    return [];
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

function buildSummary(tables: SchemaTable[], relationships: Relationship[]): string {
  const lines: string[] = [
    "DATABASE SCHEMA SUMMARY",
    "=======================",
    `This database has ${tables.length} tables with the following structure:`,
    "",
  ];

  for (const table of tables) {
    const rowLabel = typeof table.rowCount === "number" ? `${table.rowCount.toLocaleString()} rows` : "row count unavailable";
    lines.push(`TABLE: ${table.name} (${rowLabel})`);
    lines.push("  Columns:");

    for (const column of table.columns) {
      const markers: string[] = [];
      if (column.isPrimaryKey) {
        markers.push("PRIMARY KEY");
      }

      if (column.isForeignKey && column.references) {
        markers.push(`FK → ${column.references.table}.${column.references.column}`);
      }

      const enumValues = extractEnumLikeValues(table, column);
      if (enumValues.length > 0) {
        markers.push(`values: ${enumValues.map((v) => `'${v}'`).join(", ")}`);
      }

      const markerText = markers.length > 0 ? ` [${markers.join("; ")}]` : "";
      lines.push(`    - ${column.name}: ${column.type}${markerText}`);
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
      c.is_nullable,
      c.ordinal_position,
      CASE WHEN pk.column_name IS NOT NULL THEN true ELSE false END AS is_pk,
      CASE WHEN fk.column_name IS NOT NULL THEN true ELSE false END AS is_fk,
      fk.foreign_table_name,
      fk.foreign_column_name
    FROM information_schema.columns c
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
      nullable: row.is_nullable === "YES",
      isPrimaryKey: row.is_pk,
      isForeignKey: row.is_fk,
      references,
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
    } catch {
      rowCount = undefined;
    }

    try {
      const safeTableName = escapeIdentifier(tableName);
      const samples = await pool.query<Record<string, unknown>>(
        `SELECT * FROM ${safeTableName} LIMIT 3`
      );
      sampleData = samples.rows;
    } catch {
      sampleData = [];
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
