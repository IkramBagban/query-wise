"use client";

import { ChevronDown, Database } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { ColumnItem } from "@/components/schema/ColumnItem";
import type { SchemaTable } from "@/types";

interface TableItemProps {
  table: SchemaTable;
}

export function TableItem({ table }: TableItemProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-md border border-border bg-surface-2">
      <button
        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left"
        onClick={() => setOpen((prev) => !prev)}
      >
        <span className="flex items-center gap-2 text-sm text-text-1">
          <Database className="h-3.5 w-3.5 text-accent" />
          {table.name}
        </span>
        <span className="flex items-center gap-2">
          {typeof table.rowCount === "number" ? <Badge variant="info">{table.rowCount}</Badge> : null}
          <ChevronDown className={`h-4 w-4 text-text-3 transition-transform ${open ? "rotate-180" : ""}`} />
        </span>
      </button>
      {open ? (
        <div className="space-y-1 border-t border-border p-2">
          {table.columns.map((column) => (
            <ColumnItem key={column.name} column={column} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
