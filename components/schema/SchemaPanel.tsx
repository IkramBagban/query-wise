"use client";

import { Search } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SchemaSummary } from "@/components/schema/SchemaSummary";
import { TableItem } from "@/components/schema/TableItem";
import type { SchemaInfo } from "@/types";

interface SchemaPanelProps {
  schema: SchemaInfo | null;
  isLoading: boolean;
}

export function SchemaPanel({ schema, isLoading }: SchemaPanelProps) {
  const [query, setQuery] = useState("");
  const [showSummary, setShowSummary] = useState(false);

  const filtered = useMemo(() => {
    if (!schema) return [];
    const needle = query.trim().toLowerCase();
    if (!needle) return schema.tables;

    return schema.tables
      .map((table) => {
        const matchesTable = table.name.toLowerCase().includes(needle);
        const columns = table.columns.filter((column) =>
          column.name.toLowerCase().includes(needle),
        );
        if (matchesTable) return table;
        if (columns.length === 0) return null;
        return { ...table, columns };
      })
      .filter((table): table is NonNullable<typeof table> => Boolean(table));
  }, [query, schema]);

  return (
    <aside className="flex h-full min-h-0 w-full flex-col gap-4 bg-transparent p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[10px] font-bold uppercase tracking-[0.2em] text-text-3">Schema</h2>
        <Button variant="ghost" size="sm" onClick={() => setShowSummary((prev) => !prev)} className="h-7 shrink-0 text-[10px] uppercase tracking-wider hover:bg-white/5">
          {showSummary ? "Hide" : "Summary"}
        </Button>
      </div>
      <div className="relative group">
        <Search className="pointer-events-none absolute left-3 top-2.5 h-3.5 w-3.5 text-text-3 transition-colors group-focus-within:text-accent" />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Filter tables/columns"
          className="pl-9 h-9 bg-white/5 border-white/5 focus:bg-white/10"
        />
      </div>
      {showSummary ? (
        <div className="animate-fade-in">
          <SchemaSummary summary={schema?.summary ?? ""} />
        </div>
      ) : null}
      <div className="min-h-0 flex-1 space-y-1.5 overflow-auto pr-1">
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="h-10 animate-pulse rounded-md border border-white/5 bg-white/5" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-white/10 p-8 text-center bg-white/5">
            <p className="max-w-[160px] text-xs text-text-3 font-medium">
              {schema ? "No matching tables or columns found." : "Connect a database to see schema details."}
            </p>
          </div>
        ) : (
          filtered.map((table) => <TableItem key={table.name} table={table} />)
        )}
      </div>
    </aside>

  );
}
