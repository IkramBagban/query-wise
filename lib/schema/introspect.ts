import type { Relationship, SchemaColumn, SchemaInfo, SchemaTable } from "@/types";

import { getSchemaPool } from "./pool";
import { buildRangeProfileQuery, buildTopValuesQuery, escapeIdentifier } from "./profile-utils";
import { buildSummary } from "./summary";
import type { ColumnRow, EnumRow, TableRow, TopValueRow } from "./types";

export async function introspectSchema(connectionString?: string): Promise<SchemaInfo> {
  const pool = getSchemaPool(connectionString);

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
        [tableName],
      );

      const estimate = countResult.rows[0]?.estimate;
      if (typeof estimate === "string") {
        rowCount = Number.parseInt(estimate, 10);
      } else if (typeof estimate === "number") {
        rowCount = Math.round(estimate);
      }

      if (typeof rowCount !== "number" || Number.isNaN(rowCount) || rowCount < 0) {
        const exactCountResult = await pool.query<{ count: string }>(
          `SELECT COUNT(*)::text AS count FROM ${safeTableName}`,
        );
        rowCount = Number.parseInt(exactCountResult.rows[0]?.count ?? "0", 10);
      }
    } catch {
      rowCount = undefined;
    }

    try {
      const samples = await pool.query<Record<string, unknown>>(
        `SELECT * FROM ${safeTableName} LIMIT 3`,
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
            if (
              typeof min === "string" &&
              min.length > 0 &&
              typeof max === "string" &&
              max.length > 0
            ) {
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
