import type { SchemaInfo } from "@/types";

/** Column enrichment descriptions are kept short so wide tables stay affordable. */
const COLUMN_DESCRIPTION_MAX_CHARS = 100;

function truncate(text: string, max: number): string {
  const trimmed = text.trim();
  return trimmed.length > max ? `${trimmed.slice(0, max - 1).trimEnd()}…` : trimmed;
}

export function buildStructuredTableContext(schema: SchemaInfo): string {
  return schema.tables
    .map((table) => {
      const columns = table.columns
        .map((column) => {
          const flags = [
            column.isPrimaryKey ? "pk" : null,
            column.isForeignKey ? "fk" : null,
            column.nullable ? "nullable" : "not-null",
          ]
            .filter(Boolean)
            .join(", ");
          const reference = column.references
            ? ` -> ${column.references.table}.${column.references.column}`
            : "";
          const enumInfo =
            (column.enumValues?.length ?? 0) > 0
              ? ` enum[${column.enumValues?.map((value) => `'${value}'`).join(", ")}]`
              : "";
          const rangeInfo = column.range
            ? ` range[${column.range.min} -> ${column.range.max}]`
            : "";
          const topValuesInfo =
            (column.topValues?.length ?? 0) > 0
              ? ` top[${column.topValues
                  ?.map((item) => (item.count !== undefined ? `'${item.value}' (${item.count})` : `'${item.value}'`))
                  .join(", ")}]`
              : "";
          const defaultInfo = column.defaultValue
            ? ` default=${column.defaultValue}`
            : "";
          // Enrichment (SPEC-01 §2): append the LLM column description, truncated
          // so it adds intent without bloating wide tables.
          const descriptionInfo = column.description
            ? ` — ${truncate(column.description, COLUMN_DESCRIPTION_MAX_CHARS)}`
            : "";
          const typeLabel = column.fullType ?? column.type;
          return `  - ${column.name}: ${typeLabel} (${flags})${reference}${enumInfo}${rangeInfo}${topValuesInfo}${defaultInfo}${descriptionInfo}`;
        })
        .join("\n");

      // Enrichment (SPEC-01 §2): a one-line table description precedes the columns.
      const header = table.description
        ? `Table ${table.name} — ${table.description.trim()}`
        : `Table ${table.name}`;
      return `${header}\n${columns}`;
    })
    .join("\n\n");
}
