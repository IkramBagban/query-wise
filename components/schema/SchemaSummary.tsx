import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { SchemaInfo } from "@/types";

interface SchemaSummaryProps {
  schema: SchemaInfo | null;
}

function formatCellValue(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value instanceof Date) return value.toISOString();
  return JSON.stringify(value);
}

function truncateValue(value: string, max = 80): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max)}...`;
}

export function SchemaSummary({ schema }: SchemaSummaryProps) {
  if (!schema) {
    return (
      <Card className="p-4">
        <p className="text-sm text-text-2">Summary unavailable.</p>
      </Card>
    );
  }

  const totalRows = schema.tables.reduce((sum, table) => {
    if (typeof table.rowCount === "number" && table.rowCount >= 0) {
      return sum + table.rowCount;
    }
    return sum;
  }, 0);

  const totalColumns = schema.tables.reduce((sum, table) => sum + table.columns.length, 0);
  const totalPrimaryKeys = schema.tables.reduce(
    (sum, table) => sum + table.columns.filter((column) => column.isPrimaryKey).length,
    0,
  );
  const totalForeignKeys = schema.tables.reduce(
    (sum, table) => sum + table.columns.filter((column) => column.isForeignKey).length,
    0,
  );

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <p className="text-[11px] uppercase tracking-[0.15em] text-text-3">Schema Overview</p>
        <p className="mt-1 text-sm text-text-2">
          {schema.tables.length} tables, {totalColumns} columns, and {schema.relationships.length} relationships detected.
        </p>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Card className="p-3">
          <p className="text-[11px] uppercase tracking-[0.15em] text-text-3">Tables</p>
          <p className="mt-1 text-2xl font-semibold text-text-1">{schema.tables.length}</p>
        </Card>
        <Card className="p-3">
          <p className="text-[11px] uppercase tracking-[0.15em] text-text-3">Columns</p>
          <p className="mt-1 text-2xl font-semibold text-text-1">{totalColumns}</p>
        </Card>
        <Card className="p-3">
          <p className="text-[11px] uppercase tracking-[0.15em] text-text-3">Relationships</p>
          <p className="mt-1 text-2xl font-semibold text-text-1">{schema.relationships.length}</p>
        </Card>
        <Card className="p-3">
          <p className="text-[11px] uppercase tracking-[0.15em] text-text-3">Primary Keys</p>
          <p className="mt-1 text-2xl font-semibold text-text-1">{totalPrimaryKeys}</p>
        </Card>
        <Card className="p-3">
          <p className="text-[11px] uppercase tracking-[0.15em] text-text-3">Foreign Keys</p>
          <p className="mt-1 text-2xl font-semibold text-text-1">{totalForeignKeys}</p>
        </Card>
        <Card className="p-3">
          <p className="text-[11px] uppercase tracking-[0.15em] text-text-3">Estimated Rows</p>
          <p className="mt-1 text-2xl font-semibold text-text-1">{totalRows.toLocaleString()}</p>
        </Card>
      </div>

      <Card className="p-3">
        <h3 className="text-sm font-semibold text-text-1">Relationship Map</h3>
        <p className="mt-1 text-xs text-text-3">Foreign key flow between tables.</p>
        <div className="mt-3 max-h-40 space-y-1.5 overflow-auto pr-1 text-xs text-text-2">
          {schema.relationships.length === 0 ? (
            <p>No relationships detected.</p>
          ) : (
            schema.relationships.map((relation) => (
              <div
                key={`${relation.fromTable}.${relation.fromColumn}-${relation.toTable}.${relation.toColumn}`}
                className="flex items-center gap-2 rounded-md border border-border bg-surface px-2 py-1.5"
              >
                <span className="font-medium text-text-1">{relation.fromTable}</span>
                <span className="rounded bg-[#dff2e4] px-1 py-0.5 text-[10px] font-semibold text-[#1f6a39]">{relation.fromColumn}</span>
                <span className="text-text-3">{"->"}</span>
                <span className="font-medium text-text-1">{relation.toTable}</span>
                <span className="rounded bg-[#ffefcc] px-1 py-0.5 text-[10px] font-semibold text-[#8d6a00]">{relation.toColumn}</span>
              </div>
            ))
          )}
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="border-b border-border bg-surface-2 px-3 py-2">
          <h3 className="text-sm font-semibold text-text-1">Tables & Columns</h3>
          <p className="mt-0.5 text-xs text-text-3">Quick table stats with expandable column details and sample values.</p>
        </div>
        <div className="space-y-2 p-3">
          {schema.tables.map((table) => {
            const pkCount = table.columns.filter((column) => column.isPrimaryKey).length;
            const fkCount = table.columns.filter((column) => column.isForeignKey).length;
            return (
              <details key={table.name} className="overflow-hidden rounded-lg border border-border bg-white">
                <summary className="flex cursor-pointer items-center justify-between gap-2 px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-text-1">{table.name}</p>
                    <p className="text-[11px] text-text-3">
                      {table.columns.length} columns • {pkCount} PK • {fkCount} FK
                    </p>
                  </div>
                  <div className="shrink-0">
                    {typeof table.rowCount === "number" ? (
                      <Badge variant="info" showDot={false}>
                        {table.rowCount.toLocaleString()}
                      </Badge>
                    ) : null}
                  </div>
                </summary>

                <div className="space-y-3 border-t border-border px-3 py-3">
                  <div className="overflow-hidden rounded-md border border-border">
                    <div className="grid grid-cols-[1.2fr_1fr_1fr] gap-2 border-b border-border bg-surface px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-text-3">
                      <p>Column</p>
                      <p>Type</p>
                      <p>Constraints & Profile</p>
                    </div>
                    <div className="divide-y divide-border">
                      {table.columns.map((column) => {
                        const constraints = [
                          column.isPrimaryKey ? "PK" : null,
                          column.isForeignKey ? `FK -> ${column.references?.table}.${column.references?.column}` : null,
                          column.nullable ? "NULL" : "NOT NULL",
                        ].filter(Boolean);

                        return (
                          <div
                            key={`${table.name}.${column.name}`}
                            className="grid grid-cols-[1.2fr_1fr_1fr] gap-2 px-3 py-2 text-xs"
                          >
                            <div className="min-w-0">
                              <p className="truncate font-medium text-text-1">{column.name}</p>
                            </div>
                            <div className="min-w-0">
                              <p className="truncate font-mono text-text-3">{column.fullType ?? column.type}</p>
                            </div>
                            <div className="space-y-1">
                              <p className="text-[11px] text-text-3">{constraints.join(" | ")}</p>
                              {column.defaultValue ? (
                                <p className="text-[11px] text-text-3">Default: {truncateValue(column.defaultValue, 52)}</p>
                              ) : null}
                              {column.range ? (
                                <p className="text-[11px] text-text-3">
                                  Range: {truncateValue(column.range.min, 24)} {"->"} {truncateValue(column.range.max, 24)}
                                </p>
                              ) : null}
                              {(column.topValues?.length ?? 0) > 0 ? (
                                <p className="text-[11px] text-text-3">
                                  Top: {column.topValues?.map((item) => `${truncateValue(item.value, 16)} (${item.count})`).join(", ")}
                                </p>
                              ) : null}
                              {(column.enumValues?.length ?? 0) > 0 ? (
                                <p className="text-[11px] text-text-3">
                                  Enum: {column.enumValues?.map((value) => truncateValue(value, 16)).join(", ")}
                                </p>
                              ) : null}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <p className="text-[11px] uppercase tracking-[0.12em] text-text-3">Sample rows</p>
                    <div className="mt-2 space-y-2 text-xs text-text-2">
                      {(table.sampleData?.length ?? 0) === 0 ? (
                        <p>No sample rows.</p>
                      ) : (
                        table.sampleData?.map((row, index) => {
                          const preview = table.columns
                            .slice(0, 5)
                            .map((column) => `${column.name}=${truncateValue(formatCellValue(row[column.name]), 28)}`)
                            .join(", ");
                          return (
                            <div key={`${table.name}-sample-${index}`} className="rounded border border-border bg-surface px-2 py-1.5">
                              <p className="font-mono text-[11px] leading-5 text-text-2">{preview}</p>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                </div>
              </details>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
