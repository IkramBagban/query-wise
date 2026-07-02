import type { SchemaInfo, SchemaTable } from "@/types";

/** Case-insensitive lookup accepting bare or namespace-qualified names. */
export function findTable(schema: SchemaInfo, name: string): SchemaTable | null {
  const wanted = name.trim().toLowerCase();
  return (
    schema.tables.find((table) => {
      const full = table.name.toLowerCase();
      const bare = full.includes(".") ? full.slice(full.indexOf(".") + 1) : full;
      return full === wanted || bare === wanted || `public.${bare}` === wanted;
    }) ?? null
  );
}

export function suggestTables(schema: SchemaInfo, name: string, limit = 5): string[] {
  const needle = name.trim().toLowerCase();
  return schema.tables
    .map((table) => table.name)
    .filter((tableName) => tableName.toLowerCase().includes(needle) || needle.includes(tableName.toLowerCase()))
    .slice(0, limit);
}

function quoteIdent(part: string): string {
  return `"${part.replaceAll('"', '""')}"`;
}

/** Quotes a possibly namespace-qualified table name for safe interpolation. */
export function quoteTableName(name: string): string {
  return name.split(".").map(quoteIdent).join(".");
}

export function quoteColumnName(name: string): string {
  return quoteIdent(name);
}
