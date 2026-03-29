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
    <div
      className={`overflow-hidden rounded-xl border bg-white shadow-[0_6px_18px_rgba(10,50,24,0.06)] transition-colors ${
        open ? "border-[#2d7b42]/24" : "border-[#174128]/15"
      }`}
    >
      <button
        className={`flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition-colors ${
          open ? "bg-[#f6fbf2]" : "hover:bg-[#f4fbee]"
        }`}
        onClick={() => setOpen((prev) => !prev)}
      >
        <span className="flex items-center gap-2 text-sm font-medium text-text-1">
          <Database className="h-3.5 w-3.5 text-accent" />
          {table.name}
        </span>
        <span className="flex items-center gap-2">
          {typeof table.rowCount === "number" ? (
            <Badge variant="info" showDot={false}>
              {table.rowCount.toLocaleString()}
            </Badge>
          ) : null}
          <ChevronDown className={`h-4 w-4 text-text-3 transition-transform ${open ? "rotate-180" : ""}`} />
        </span>
      </button>
      {open ? (
        <div className="space-y-1 border-t border-[#174128]/14 bg-[#fcfffb] p-2">
          {table.columns.map((column) => (
            <ColumnItem key={column.name} column={column} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
