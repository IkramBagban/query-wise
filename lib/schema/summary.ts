import type { Relationship, SchemaTable } from "@/types";

import { extractRepresentativeValues, formatValue } from "./profile-utils";

export function buildSummary(tables: SchemaTable[], relationships: Relationship[]): string {
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
    const rowLabel =
      typeof table.rowCount === "number"
        ? `${table.rowCount.toLocaleString()} rows`
        : "row count unavailable";
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
          `top: ${(column.topValues ?? []).map((item) => `'${item.value}' (${item.count})`).join(", ")}`,
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
        `  ${relation.fromTable}.${relation.fromColumn} → ${relation.toTable}.${relation.toColumn}`,
      );
    }
  }

  return lines.join("\n");
}
