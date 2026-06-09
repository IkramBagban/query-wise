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
    <div className="overflow-hidden border-b border-[#e6ece8] bg-white">
      <button
        className={`flex w-full items-center justify-between gap-3 px-1 py-3 text-left transition-colors ${
          open ? "bg-[#f6faf7]" : "hover:bg-[#f6faf7]"
        }`}
        onClick={() => setOpen((prev) => !prev)}
      >
        <span className="flex items-center gap-3 text-[13px] font-medium text-[#263c32]">
          <Database className="size-4 text-[#64786d]" />
          {table.name}
        </span>
        <span className="flex items-center gap-2">
          {typeof table.rowCount === "number" ? (
            <Badge variant="neutral" showDot={false}>
              {table.rowCount.toLocaleString()}
            </Badge>
          ) : null}
          <ChevronDown className={`size-4 -rotate-90 text-[#718178] transition-transform ${open ? "rotate-0" : ""}`} />
        </span>
      </button>
      {open ? (
        <div className="flex flex-col gap-1 border-t border-[#e6ece8] bg-[#fbfdfc] p-2">
          {table.columns.map((column) => (
            <ColumnItem key={column.name} column={column} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
