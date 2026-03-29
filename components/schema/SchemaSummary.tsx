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

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="p-3">
          <p className="text-[11px] uppercase tracking-[0.15em] text-text-3">Tables</p>
          <p className="mt-1 text-2xl font-semibold text-text-1">{schema.tables.length}</p>
        </Card>
        <Card className="p-3">
          <p className="text-[11px] uppercase tracking-[0.15em] text-text-3">Relationships</p>
          <p className="mt-1 text-2xl font-semibold text-text-1">{schema.relationships.length}</p>
        </Card>
        <Card className="p-3">
          <p className="text-[11px] uppercase tracking-[0.15em] text-text-3">Estimated Rows</p>
          <p className="mt-1 text-2xl font-semibold text-text-1">{totalRows.toLocaleString()}</p>
        </Card>
      </div>

      <Card className="p-3">
        <h3 className="text-sm font-semibold text-text-1">Relationships</h3>
        <div className="mt-2 max-h-32 space-y-1 overflow-auto pr-1 text-xs text-text-2">
          {schema.relationships.length === 0 ? (
            <p>No relationships detected.</p>
          ) : (
            schema.relationships.map((relation) => (
              <p key={`${relation.fromTable}.${relation.fromColumn}-${relation.toTable}.${relation.toColumn}`}>
                {relation.fromTable}.{relation.fromColumn} {"->"} {relation.toTable}.{relation.toColumn}
              </p>
            ))
          )}
        </div>
      </Card>

      <div className="space-y-3">
        {schema.tables.map((table) => (
          <Card key={table.name} className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-border bg-surface-2 px-3 py-2">
              <h3 className="text-sm font-semibold text-text-1">{table.name}</h3>
              {typeof table.rowCount === "number" ? <Badge variant="info">{table.rowCount.toLocaleString()}</Badge> : null}
            </div>
            <div className="space-y-3 p-3">
              <div className="space-y-1.5">
                {table.columns.map((column) => {
                  const flags = [
                    column.isPrimaryKey ? "PK" : null,
                    column.isForeignKey ? `FK->${column.references?.table}.${column.references?.column}` : null,
                    column.nullable ? "NULL" : "NOT NULL",
                  ]
                    .filter(Boolean)
                    .join(" | ");
                  return (
                    <div key={`${table.name}.${column.name}`} className="grid grid-cols-[1fr_auto] gap-2 text-xs">
                      <p className="truncate text-text-1">{column.name}</p>
                      <p className="truncate font-mono text-text-3">{column.fullType ?? column.type}</p>
                      <p className="col-span-2 text-[11px] text-text-3">{flags}</p>
                      {column.defaultValue ? (
                        <p className="col-span-2 text-[11px] text-text-3">Default: {column.defaultValue}</p>
                      ) : null}
                      {(column.enumValues?.length ?? 0) > 0 ? (
                        <p className="col-span-2 text-[11px] text-text-3">Enum: {column.enumValues?.join(", ")}</p>
                      ) : null}
                    </div>
                  );
                })}
              </div>

              <div>
                <p className="text-[11px] uppercase tracking-[0.12em] text-text-3">Sample rows</p>
                <div className="mt-2 space-y-1 text-xs text-text-2">
                  {(table.sampleData?.length ?? 0) === 0 ? (
                    <p>No sample rows.</p>
                  ) : (
                    table.sampleData?.map((row, index) => {
                      const preview = table.columns
                        .slice(0, 4)
                        .map((column) => `${column.name}=${formatCellValue(row[column.name])}`)
                        .join(", ");
                      return <p key={`${table.name}-sample-${index}`}>{preview}</p>;
                    })
                  )}
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
