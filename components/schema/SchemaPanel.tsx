"use client";

import { Search } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ErDiagramModal } from "@/components/schema/ErDiagramModal";
import { SchemaSummary } from "@/components/schema/SchemaSummary";
import { TableItem } from "@/components/schema/TableItem";
import type { SchemaInfo } from "@/types";

interface SchemaPanelProps {
  schema: SchemaInfo | null;
  isLoading: boolean;
}

export function SchemaPanel({ schema, isLoading }: SchemaPanelProps) {
  const [query, setQuery] = useState("");
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [erOpen, setErOpen] = useState(false);

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
      <div className="space-y-2">
        <h2 className="text-xs font-bold uppercase tracking-[0.18em] text-[#486856]">Schema</h2>
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setErOpen(true)}
            className="h-9 rounded-full border border-[#164229]/18 bg-white px-3 text-xs font-semibold text-[#123623] hover:border-[#164229]/30 hover:bg-[#eaf8e2]"
          >
            ER Diagram
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSummaryOpen(true)}
            className="h-9 rounded-full border border-[#164229]/18 bg-white px-3 text-xs font-semibold text-[#123623] hover:border-[#164229]/30 hover:bg-[#eaf8e2]"
          >
            Summary
          </Button>
        </div>
      </div>
      <div className="relative group">
        <Search className="pointer-events-none absolute left-3 top-2.5 h-3.5 w-3.5 text-text-3 transition-colors group-focus-within:text-accent" />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Filter tables/columns"
          className="h-10 rounded-xl border-[#164229]/14 bg-white pl-9 focus:border-[#2d7b42] focus:bg-white"
        />
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-auto pr-1">
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="h-10 animate-pulse rounded-xl border border-[#164229]/10 bg-white" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[#164229]/25 bg-white p-8 text-center">
            <p className="max-w-[160px] text-xs font-medium text-text-3">
              {schema ? "No matching tables or columns found." : "Connect a database to see schema details."}
            </p>
          </div>
        ) : (
          filtered.map((table) => <TableItem key={table.name} table={table} />)
        )}
      </div>

      <Dialog
        open={summaryOpen}
        onOpenChange={setSummaryOpen}
        panelClassName="max-h-[88vh] max-w-[min(1120px,94vw)] overflow-hidden p-0"
      >
        <div className="flex h-full max-h-[88vh] flex-col">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <div>
              <h2 className="text-lg font-semibold text-text-1">Schema Summary</h2>
              <p className="text-xs text-text-3">Structured overview of tables, columns, relationships, and sample values.</p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setSummaryOpen(false)}>
              Close
            </Button>
          </div>

          <div className="min-h-0 flex-1 overflow-auto p-4">
            <SchemaSummary schema={schema} />

          </div>
        </div>
      </Dialog>

      <ErDiagramModal open={erOpen} onOpenChange={setErOpen} schema={schema} />
    </aside>

  );
}
