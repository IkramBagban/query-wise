import { Link2, KeyRound } from "lucide-react";

import { formatSchemaTypeLabel } from "@/lib/schema-type-label";
import type { SchemaColumn } from "@/types";

interface ColumnItemProps {
  column: SchemaColumn;
}

export function ColumnItem({ column }: ColumnItemProps) {
  const typeLabel = formatSchemaTypeLabel(column.fullType ?? column.type);

  return (
    <div className="flex items-center justify-between gap-2 rounded px-2 py-1 text-xs text-text-2 hover:bg-surface-3">
      <span className="flex min-w-0 items-center gap-1.5 truncate text-text-1">
        {column.isPrimaryKey ? <KeyRound className="h-3.5 w-3.5 text-warning" /> : null}
        {!column.isPrimaryKey && column.isForeignKey ? (
          <Link2 className="h-3.5 w-3.5 text-accent" />
        ) : null}
        <span className="truncate">{column.name}</span>
      </span>
      <span className="shrink-0 font-mono text-[11px] text-text-3">{typeLabel}</span>
    </div>
  );
}
